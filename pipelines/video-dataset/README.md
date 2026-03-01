# Video Dataset Pipeline

End-to-end pipeline for creating training-ready video datasets with streaming support.

## Pipeline Stages

1. **Ingest** — Download/discover raw videos (local, S3)
2. **Segment** — Split into 2-10s clips via scene detection
3. **Validate** — Reject static/bad clips
4. **Annotate** — Generate captions (placeholder or VLM)
5. **Audio Process** — Extract + resample audio to 16kHz
6. **Export** — Produce clip.mp4 + caption.json per sample

## Streaming

The `VideoClipStreamDataset` class supports streaming iteration without downloading the full dataset:

```python
from stream_loader import VideoClipStreamDataset

dataset = VideoClipStreamDataset(data_dir="./dataset/")
for sample in dataset:
    frames = sample["frames"]   # numpy array
    caption = sample["caption"]  # dict
```

## Config

Edit `config.yaml` to customize pipeline parameters.

## Tests

```bash
pytest tests/ -v
```
