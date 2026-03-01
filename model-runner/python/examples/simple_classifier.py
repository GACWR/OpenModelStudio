"""Example: Simple MNIST classifier using the model runner framework."""

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
        optimizer = torch.optim.Adam(model.parameters(), lr=ctx.params.get("lr", 1e-3))
        epochs = ctx.params.get("epochs", 5)

        dataset = ctx.get_dataset("mnist", split="train")

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
