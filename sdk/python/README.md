<p align="center">
  <strong>OpenModelStudio</strong>
</p>

<p align="center">
  <a href="https://pypi.org/project/openmodelstudio/"><img src="https://img.shields.io/pypi/v/openmodelstudio" alt="PyPI"></a>
  <a href="https://pypi.org/project/openmodelstudio/"><img src="https://img.shields.io/pypi/pyversions/openmodelstudio" alt="Python"></a>
  <a href="https://github.com/GACWR/OpenModelStudio/blob/master/sdk/python/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
</p>

# OpenModelStudio Python SDK

The OpenModelStudio SDK lets you manage datasets, models, features, hyperparameters, training/inference jobs, pipelines, and sweeps — all from a Jupyter notebook running inside an OpenModelStudio workspace.

## Quick Start

```python
import openmodelstudio
```

The SDK auto-configures from workspace environment variables (`OPENMODELSTUDIO_API_URL`, `OPENMODELSTUDIO_TOKEN`, `OPENMODELSTUDIO_PROJECT_ID`). No manual setup needed.

---

## Full Workflow Example (Titanic)

```python
import openmodelstudio
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# ─── 1. Load a dataset ───────────────────────────────────────────
df = openmodelstudio.load_dataset("titanic")
df = df.dropna(subset=["Survived", "Pclass", "Age", "Fare"])

X = df[["Pclass", "Age", "Fare"]].values
y = df["Survived"].values
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# ─── 2. Train a model locally ────────────────────────────────────
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)

acc = accuracy_score(y_test, clf.predict(X_test))
print(f"Accuracy: {acc:.3f}")

# ─── 3. Register the trained model ───────────────────────────────
handle = openmodelstudio.register_model("titanic-rf", model=clf)
print(handle)  # ModelHandle(id='...', name='titanic-rf', version=1)

# ─── 4. Load the model back ──────────────────────────────────────
clf2 = openmodelstudio.load_model("titanic-rf")
preds = clf2.predict(X_test)
print(f"Loaded model accuracy: {accuracy_score(y_test, preds):.3f}")
```

---

## API Reference

### Datasets

#### `openmodelstudio.list_datasets() -> list`
List all datasets in the current project.
```python
datasets = openmodelstudio.list_datasets()
for ds in datasets:
    print(ds["name"], ds["format"], ds["size_bytes"])
```

#### `openmodelstudio.load_dataset(name_or_id, format=None) -> DataFrame`
Load a dataset by name or UUID into a pandas DataFrame.
```python
df = openmodelstudio.load_dataset("titanic")
df = openmodelstudio.load_dataset("54e1ee81-...")  # by UUID
```

#### `openmodelstudio.create_dataset(name, data, format=None, description=None) -> dict`
Create a new dataset from a DataFrame or local file.
```python
# From a DataFrame
ds = openmodelstudio.create_dataset("my-data", df)

# From a local file
ds = openmodelstudio.create_dataset("my-data", "/workspace/data.csv")

# As parquet
ds = openmodelstudio.create_dataset("my-data", df, format="parquet")
```

#### `openmodelstudio.upload_dataset(dataset_id, file_path) -> dict`
Upload a local file to an existing dataset.
```python
openmodelstudio.upload_dataset("54e1ee81-...", "data.csv")
```

---

### Models

#### `openmodelstudio.register_model(name, model=None, framework=None, description=None, source_code=None) -> ModelHandle`
Register a model. Pass a trained model object (auto-detected) or source code.
```python
# Auto-detect framework from model object
handle = openmodelstudio.register_model("my-clf", model=clf)

# Or pass source code with train(ctx)/infer(ctx) functions
handle = openmodelstudio.register_model("my-model", source_code="""
def train(ctx):
    import torch
    # your training code here
    ctx.log_metric("loss", 0.5, epoch=1)

def infer(ctx):
    data = ctx.get_input_data()
    # your inference code here
    ctx.set_output({"prediction": 1})
""")
```

#### `openmodelstudio.load_model(name_or_id, version=None, device=None)`
Load a trained model object for inference in notebooks.
```python
clf = openmodelstudio.load_model("my-clf")
predictions = clf.predict(X_test)

# PyTorch model on specific device
net = openmodelstudio.load_model("my-net", device="cpu")
```

#### `openmodelstudio.publish_version(model_id, source_code=None, artifact_path=None, summary=None) -> dict`
Publish a new version of an existing model.
```python
handle.publish_version(source_code=open("train_v2.py").read(), summary="Added dropout")
```

---

### Feature Store

#### `openmodelstudio.create_features(df, feature_names=None, group_name=None, entity="default", transforms=None) -> dict`
Register features with optional transforms. Stats (mean, std, min, max) are computed and stored.
```python
# Register all numeric columns
openmodelstudio.create_features(df, group_name="titanic-features")

# With transforms
openmodelstudio.create_features(df,
    feature_names=["Age", "Fare", "Pclass"],
    group_name="titanic-scaled",
    transforms={
        "Age": "standard_scaler",
        "Fare": "min_max_scaler",
    })
```

Available transforms: `standard_scaler`, `min_max_scaler`, `log_transform`, `one_hot`

#### `openmodelstudio.load_features(group_name_or_id, df=None)`
Load feature definitions. If a DataFrame is passed, apply stored transforms.
```python
# Get feature definitions
features = openmodelstudio.load_features("titanic-scaled")

# Apply transforms to new data
df_scaled = openmodelstudio.load_features("titanic-scaled", df=df_test)
```

---

### Hyperparameter Store

#### `openmodelstudio.create_hyperparameters(name, parameters, model_id=None, description=None) -> dict`
Save a named hyperparameter set.
```python
openmodelstudio.create_hyperparameters("rf-v1", {
    "n_estimators": 100,
    "max_depth": 10,
    "min_samples_split": 5,
    "learning_rate": 0.01,
})
```

#### `openmodelstudio.load_hyperparameters(name_or_id) -> dict`
Load hyperparameters by name or UUID. Returns the parameters dict.
```python
params = openmodelstudio.load_hyperparameters("rf-v1")
clf = RandomForestClassifier(**params)
```

#### `openmodelstudio.list_hyperparameters() -> list`
List all hyperparameter sets in the current project.
```python
for hp in openmodelstudio.list_hyperparameters():
    print(hp["name"], hp["parameters"])
```

---

### Training & Inference Jobs

#### `openmodelstudio.start_training(model_id, ...) -> dict`
Start a training job on a K8s pod. The model's `train(ctx)` function runs remotely.
```python
# Basic
job = openmodelstudio.start_training("my-model")

# With dataset and hyperparameters
job = openmodelstudio.start_training("my-model",
    dataset_id="titanic",
    hyperparameters={"lr": 0.001, "epochs": 10})

# Using stored hyperparameter set
job = openmodelstudio.start_training("my-model",
    dataset_id="titanic",
    hyperparameter_set="rf-v1")

# Wait for completion
job = openmodelstudio.start_training("my-model", wait=True)
print(job["status"])  # "completed" or "failed"
```

#### `openmodelstudio.start_inference(model_id, ...) -> dict`
Start an inference job. The model's `infer(ctx)` function runs remotely.
```python
# With input data
result = openmodelstudio.start_inference("my-model",
    input_data={"features": [3, 25.0, 7.25]},
    wait=True)

# Batch inference on a dataset
result = openmodelstudio.start_inference("my-model",
    dataset_id="test-data",
    wait=True)
```

#### `openmodelstudio.get_job(job_id) -> dict`
Get job details (status, metrics, timestamps).
```python
job = openmodelstudio.get_job("54e1ee81-...")
print(job["status"], job.get("metrics"))
```

#### `openmodelstudio.wait_for_job(job_id, poll_interval=2.0) -> dict`
Block until a job reaches a terminal state.
```python
job = openmodelstudio.wait_for_job(job["job_id"])
```

#### `openmodelstudio.log_metric(job_id, metric_name, value, step=None, epoch=None)`
Log a metric for a running job (used inside model code via `ctx.log_metric()`).
```python
openmodelstudio.log_metric(job_id, "loss", 0.45, epoch=1)
```

---

### Monitoring

#### `openmodelstudio.list_jobs(job_type=None, status=None) -> list`
List all jobs in the current project.
```python
# All jobs
jobs = openmodelstudio.list_jobs()

# Only running training jobs
jobs = openmodelstudio.list_jobs(job_type="training", status="running")
```

#### `openmodelstudio.stream_metrics(job_id, callback=None)`
Stream real-time metrics from a running job via SSE.
```python
# As iterator
for event in openmodelstudio.stream_metrics(job_id):
    print(event)

# With callback
openmodelstudio.stream_metrics(job_id, callback=lambda e: print(e))
```

---

### Pipelines

#### `openmodelstudio.create_pipeline(name, steps, description=None) -> dict`
Create a multi-step pipeline (train then infer, etc.).
```python
pipeline = openmodelstudio.create_pipeline("train-and-infer", [
    {
        "type": "training",
        "model_id": "my-model",
        "dataset_id": "titanic",
        "hyperparameters": {"epochs": 10},
    },
    {
        "type": "inference",
        "model_id": "my-model",
        "input_data": {"features": [3, 25.0, 7.25]},
    },
])
```

#### `openmodelstudio.run_pipeline(pipeline_id, wait=False) -> dict`
Execute a pipeline. Steps run sequentially.
```python
result = openmodelstudio.run_pipeline(pipeline["id"], wait=True)
```

#### `openmodelstudio.get_pipeline(pipeline_id) -> dict`
Get pipeline status and step details.
```python
status = openmodelstudio.get_pipeline(pipeline["id"])
for step in status["steps"]:
    print(step["step_type"], step["status"])
```

#### `openmodelstudio.list_pipelines() -> list`
List all pipelines in the current project.

---

### Hyperparameter Sweeps

#### `openmodelstudio.create_sweep(name, model_id, dataset_id, search_space, ...) -> dict`
Create and start a hyperparameter sweep. Runs multiple training jobs with different parameters.
```python
sweep = openmodelstudio.create_sweep("lr-search",
    model_id="my-model",
    dataset_id="titanic",
    search_space={
        "lr": {"type": "log_uniform", "min": 1e-5, "max": 1e-1},
        "batch_size": {"type": "choice", "values": [16, 32, 64]},
        "epochs": {"type": "int_range", "min": 5, "max": 50},
        "dropout": {"type": "uniform", "min": 0.0, "max": 0.5},
    },
    strategy="random",       # or "grid"
    max_trials=20,
    objective_metric="val_loss",
    objective_direction="minimize",
    hardware_tier="cpu-small",
    wait=True)

print(f"Best metric: {sweep['best_metric_value']}")
print(f"Best job: {sweep['best_job_id']}")
```

Search space types:
- `uniform`: float in `[min, max]`
- `log_uniform`: float sampled log-uniformly in `[min, max]`
- `int_range`: integer in `[min, max]`
- `choice`: pick from `values` list

#### `openmodelstudio.get_sweep(sweep_id) -> dict`
Get sweep status, completed trials, and best result.

#### `openmodelstudio.stop_sweep(sweep_id) -> dict`
Stop a running sweep early.

---

## Writing Model Code for Remote Execution

When you use `start_training` or `start_inference`, your model's `train(ctx)` or `infer(ctx)` function runs inside an ephemeral K8s pod. The `ctx` object (ModelContext) provides:

```python
# Inside your model code:
def train(ctx):
    # Access hyperparameters
    lr = ctx.hyperparameters.get("lr", 0.001)
    epochs = ctx.hyperparameters.get("epochs", 10)

    # Device detection (cuda/mps/cpu)
    device = ctx.device

    # Log metrics (streamed to UI in real-time)
    for epoch in range(epochs):
        loss = do_training(...)
        ctx.log_metric("loss", loss, epoch=epoch)
        ctx.log_metric("accuracy", acc, epoch=epoch)

    # Save checkpoint
    ctx.save_checkpoint(model, optimizer, epoch=epoch, metrics={"loss": loss})

    # Save arbitrary artifact
    ctx.save_artifact("/tmp/model.pkl", "model-weights", artifact_type="model_weights")

def infer(ctx):
    # Get input data
    data = ctx.get_input_data()

    # Load checkpoint from training
    state = ctx.load_checkpoint()
    model.load_state_dict(state["model_state_dict"])

    # Run inference
    output = model.predict(data)

    # Store output (saved to job's metrics field)
    ctx.set_output({"predictions": output.tolist()})
```

---

## Complete End-to-End Example

```python
import openmodelstudio
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# ── Load & prep data ──
df = openmodelstudio.load_dataset("titanic")
df = df.dropna(subset=["Survived", "Pclass", "Age", "Fare"])

# ── Register features with transforms ──
openmodelstudio.create_features(df,
    feature_names=["Pclass", "Age", "Fare"],
    group_name="titanic-features",
    transforms={"Age": "standard_scaler", "Fare": "min_max_scaler"})

# ── Apply transforms ──
df_scaled = openmodelstudio.load_features("titanic-features", df=df)

X = df_scaled[["Pclass", "Age", "Fare"]].values
y = df["Survived"].values
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# ── Store hyperparameters ──
openmodelstudio.create_hyperparameters("rf-v1", {
    "n_estimators": 100,
    "max_depth": 10,
    "random_state": 42,
})

# ── Train locally ──
params = openmodelstudio.load_hyperparameters("rf-v1")
clf = RandomForestClassifier(**params)
clf.fit(X_train, y_train)
print(f"Accuracy: {accuracy_score(y_test, clf.predict(X_test)):.3f}")

# ── Register model ──
handle = openmodelstudio.register_model("titanic-rf", model=clf)

# ── Load model back & verify ──
clf2 = openmodelstudio.load_model("titanic-rf")
print(f"Reloaded accuracy: {accuracy_score(y_test, clf2.predict(X_test)):.3f}")

# ── Monitor jobs ──
jobs = openmodelstudio.list_jobs()
for j in jobs:
    print(j["id"], j["status"], j.get("job_type"))
```
