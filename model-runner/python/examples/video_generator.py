"""Example: Stub video generation model."""

import io
import numpy as np
import torch
import torch.nn as nn

from model_interface import ModelInterface


class SimpleVideoGenerator(nn.Module):
    """Tiny generator that produces random colored frames (stub)."""

    def __init__(self, latent_dim=64, num_frames=16, h=64, w=64):
        super().__init__()
        self.num_frames = num_frames
        self.h = h
        self.w = w
        self.net = nn.Sequential(
            nn.Linear(latent_dim, 256),
            nn.ReLU(),
            nn.Linear(256, num_frames * h * w * 3),
            nn.Sigmoid(),
        )

    def forward(self, z):
        out = self.net(z)
        return out.view(-1, self.num_frames, 3, self.h, self.w)


class VideoGenerator(ModelInterface):
    def train(self, ctx):
        latent_dim = ctx.params.get("latent_dim", 64)
        model = SimpleVideoGenerator(latent_dim=latent_dim).to(ctx.device)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        epochs = ctx.params.get("epochs", 10)

        for epoch in range(epochs):
            # Synthetic training: generate random latents, minimize output variance
            z = torch.randn(4, latent_dim, device=ctx.device)
            video = model(z)
            loss = video.var()  # Dummy loss
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            ctx.log_metric("loss", loss.item(), epoch=epoch)

        ctx.save_checkpoint(model, optimizer, epoch=epochs - 1)

    def infer(self, ctx):
        latent_dim = ctx.params.get("latent_dim", 64)
        model = SimpleVideoGenerator(latent_dim=latent_dim).to(ctx.device)
        checkpoint = ctx.load_checkpoint()
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        with torch.no_grad():
            z = torch.randn(1, latent_dim, device=ctx.device)
            video = model(z)  # (1, F, 3, H, W)

        frames = (video[0].cpu().numpy() * 255).astype(np.uint8)
        ctx.set_output({"frames_shape": list(frames.shape), "sample_pixel": frames[0, 0, 0, 0].item()})
