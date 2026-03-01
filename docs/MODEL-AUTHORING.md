# Model Authoring Guide

Write and train models directly in OpenModelStudio using Python (PyTorch) or Rust (tch-rs).

## Python Models

### Basic Structure

Every Python model must implement the `ModelInterface` base class from `model_interface.py`:

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from model_interface import ModelInterface


class MNISTClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, 1)
        self.conv2 = nn.Conv2d(32, 64, 3, 1)
        self.fc1 = nn.Linear(9216, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = F.relu(self.conv1(x))
        x = F.relu(self.conv2(x))
        x = F.max_pool2d(x, 2)
        x = torch.flatten(x, 1)
        x = F.relu(self.fc1(x))
        return self.fc2(x)


class SimpleClassifier(ModelInterface):
    def train(self, ctx):
        model = MNISTClassifier().to(ctx.device)
        optimizer = torch.optim.Adam(
            model.parameters(),
            lr=ctx.hyperparameters.get("lr", 1e-3),
        )
        epochs = ctx.hyperparameters.get("epochs", 5)

        for epoch in range(epochs):
            total_loss = 0
            steps = 0
            for batch in dataset:
                images = batch["image"].float().unsqueeze(1).to(ctx.device) / 255.0
                labels = batch["label"].to(ctx.device)

                optimizer.zero_grad()
                output = model(images)
                loss = F.cross_entropy(output, labels)
                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                steps += 1
                ctx.log_metric("train_loss", loss.item(), step=steps, epoch=epoch)

            avg_loss = total_loss / max(steps, 1)
            ctx.log_metric("epoch_loss", avg_loss, epoch=epoch)
            ctx.save_checkpoint(model, optimizer, epoch=epoch, metrics={"loss": avg_loss})

    def infer(self, ctx):
        checkpoint = ctx.load_checkpoint()
        model = MNISTClassifier().to(ctx.device)
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        input_data = ctx.get_input_data()
        image = torch.tensor(input_data["image"]).float().unsqueeze(0).unsqueeze(0).to(ctx.device) / 255.0

        with torch.no_grad():
            output = model(image)
            pred = output.argmax(dim=1).item()
            probs = F.softmax(output, dim=1)[0].tolist()

        ctx.set_output({"prediction": pred, "probabilities": probs})
```

### ModelContext API

The `ctx` object passed to `train()` and `infer()` provides:

| Method | Description |
|--------|-------------|
| `ctx.hyperparameters` | Dict of hyperparameters from the job config |
| `ctx.device` | Auto-detected torch device (CUDA > MPS > CPU) |
| `ctx.log_metric(name, value, step, epoch)` | Log a metric (streamed to UI in real-time) |
| `ctx.save_checkpoint(model, optimizer, epoch, metrics)` | Save checkpoint to S3 |
| `ctx.load_checkpoint(version)` | Load checkpoint from S3 |
| `ctx.save_artifact(local_path, name, artifact_type)` | Upload a file as an artifact |
| `ctx.get_input_data()` | Get input data for inference |
| `ctx.set_output(output)` | Store inference output |
| `ctx.log(message, level)` | Log a message (persisted to DB) |
| `ctx.logger` | Standard Python logger (auto-persisted) |

### Using Streaming Datasets

For large datasets, use streaming to avoid loading everything to memory:

```python
from data_loader import (
    HuggingFaceStreamDataset,
    S3StreamDataset,
    VideoFrameDataset,
    AudioChunkDataset,
    create_dataloader,
)


class MyModel(ModelInterface):
    def train(self, ctx):
        # HuggingFace streaming
        dataset = HuggingFaceStreamDataset("mnist", split="train")
        loader = torch.utils.data.DataLoader(dataset, batch_size=32)

        # S3 streaming
        dataset = S3StreamDataset(bucket="my-bucket", prefix="train/")
        loader = torch.utils.data.DataLoader(dataset, batch_size=32)

        # Factory function
        loader = create_dataloader("huggingface", batch_size=32, name="mnist", split="train")

        # ... training loop using loader
```

### Generative Models

For models that produce images/video/audio, set structured output:

```python
class VideoGenModel(ModelInterface):
    def infer(self, ctx):
        input_data = ctx.get_input_data()
        prompt = input_data.get("prompt", "")
        frames = self.model.generate(prompt, num_frames=16)
        ctx.set_output({
            "type": "video",
            "frames": frames.tolist(),
            "fps": 8,
        })
```

## Rust Models

### Basic Structure

Rust models use `ModelContext` from the model runner. The runner dispatches by model name:

```rust
// model-runner/rust/src/main.rs dispatches by MODEL_NAME env var
// Each model is a function that receives a ModelContext

use crate::context::ModelContext;
use tch::{nn, nn::Module, nn::OptimizerConfig, Device, Tensor};

pub fn train_my_model(ctx: &ModelContext, epochs: usize, lr: f64, batch_size: usize) -> anyhow::Result<()> {
    let vs = nn::VarStore::new(ctx.device);
    let net = nn::seq()
        .add(nn::linear(&vs.root(), 784, 256, Default::default()))
        .add_fn(|x| x.relu())
        .add(nn::linear(&vs.root(), 256, 10, Default::default()));

    let mut opt = nn::Adam::default().build(&vs, lr)?;

    for epoch in 0..epochs {
        // ... training loop
        ctx.log_metric("loss", loss_value, Some(step as i64), Some(epoch as i64));
    }

    Ok(())
}
```

### Rust ModelContext API

| Method | Description |
|--------|-------------|
| `ctx.device` | Auto-detected tch Device (CUDA or CPU) |
| `ctx.log_metric(name, value, step, epoch)` | Log metric to API |
| `ctx.get_param_f64(key, default)` | Get float hyperparameter |
| `ctx.get_param_i64(key, default)` | Get integer hyperparameter |
| `ctx.params` | Raw JobParams (HashMap) |

## Writing Code in the Browser

1. Navigate to your model's page
2. The Monaco editor loads with your model code
3. Write or paste your model implementation
4. Press **Ctrl+S** (or click Save) to create a new version
5. Click **Run Training** to start a job with the current version

### Editor Features
- Syntax highlighting for Python and Rust
- Auto-completion for PyTorch and tch-rs APIs
- Error highlighting (lint on save)
- Version diff view
- Keyboard shortcuts (standard Monaco bindings)

## Tips

- **Start small** -- Use a tiny dataset first to verify your model runs
- **Check metrics** -- Watch the real-time training dashboard for issues
- **Use checkpoints** -- Save checkpoints so you don't lose progress
- **CPU-first** -- All models should work on CPU; GPU is an optimization
- **Pin dependencies** -- Specify exact versions in your model metadata
