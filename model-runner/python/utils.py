"""Utility helpers for the model runner."""

import os
import logging
import sys


def setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )


def get_env(name: str, default: str = None, required: bool = False) -> str:
    val = os.environ.get(name, default)
    if required and val is None:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return val


def detect_device():
    import torch
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")
