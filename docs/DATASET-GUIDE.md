# Dataset Guide

## Uploading Datasets

### Via the UI

1. Navigate to **Datasets** in the sidebar
2. Click **Upload Dataset**
3. Fill in name and description
4. Drag-and-drop or select files (CSV, Parquet, JSON, images, tar archives)
5. Click **Upload**

### Via the API

```bash
curl -X POST http://localhost:31001/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=my-dataset" \
  -F "description=Training data for image classification" \
  -F "file=@./data.csv"
```

### Via the LLM Assistant

> "Upload the file data.csv as a dataset called 'My Training Data'"

## Supported Formats

| Format | Extension | Streaming | Notes |
|--------|-----------|-----------|-------|
| CSV | `.csv` | Yes | Auto-detects headers and types |
| Parquet | `.parquet` | Yes | Preferred for large tabular data |
| JSON/JSONL | `.json`, `.jsonl` | Yes | One record per line for JSONL |
| Images | `.jpg`, `.png`, `.webp` | Yes | Uploaded as tar archive |
| Video | `.mp4`, `.webm` | Yes | Processed by video pipeline |
| WebDataset | `.tar` | Yes | Native streaming format |
| HuggingFace | `hf://` | Yes | Load directly from HuggingFace Hub |

## Streaming Data Loading

OpenModelStudio never loads entire datasets to disk. All data flows through streaming pipelines.

### Available Streaming Datasets

The model runner includes five streaming dataset classes in `model-runner/python/data_loader.py`:

```python
from data_loader import (
    HuggingFaceStreamDataset,
    S3StreamDataset,
    PostgresStreamDataset,
    VideoFrameDataset,
    AudioChunkDataset,
    create_dataloader,       # Factory function
)
```

### Usage Examples

```python
import torch

# From HuggingFace (streaming=True under the hood)
from data_loader import HuggingFaceStreamDataset
dataset = HuggingFaceStreamDataset("mnist", split="train")
loader = torch.utils.data.DataLoader(dataset, batch_size=32)

# From S3
from data_loader import S3StreamDataset
dataset = S3StreamDataset(bucket="my-bucket", prefix="data/train/")
loader = torch.utils.data.DataLoader(dataset, batch_size=32)

# From PostgreSQL (server-side cursor)
from data_loader import PostgresStreamDataset
dataset = PostgresStreamDataset(db_url="postgres://...", query="SELECT * FROM features")

# Video frames (on-the-fly decoding with PyAV)
from data_loader import VideoFrameDataset
dataset = VideoFrameDataset(video_paths=["video1.mp4", "video2.mp4"], fps=8)

# Audio chunks (soundfile streaming)
from data_loader import AudioChunkDataset
dataset = AudioChunkDataset(audio_paths=["audio1.wav"], chunk_seconds=5.0, sr=16000)

# Factory function
from data_loader import create_dataloader
loader = create_dataloader("huggingface", batch_size=32, name="mnist", split="train")
```

### How Streaming Works

```
Storage (S3/HuggingFace/Postgres) --> Iterator --> Decode in Worker Process --> Batch --> Device
```

- Each dataset class extends PyTorch's `IterableDataset`
- Data is fetched lazily via iterators (paginated for S3, server-side cursor for Postgres)
- Each DataLoader worker processes its own shard
- Memory usage stays constant regardless of dataset size

## Preparing Datasets

### Tabular Data

```python
# Ensure your CSV has headers
# id,feature_1,feature_2,label
# 1,0.5,0.3,cat
# 2,0.8,0.1,dog

# Upload via UI or API -- OpenModelStudio auto-detects schema
```

### Image Datasets

Package images in a tar archive with a manifest:

```
my-images/
+-- manifest.jsonl       # {"file": "img_001.jpg", "label": "cat"}
+-- img_001.jpg
+-- img_002.jpg
+-- ...
```

```bash
tar cf my-images.tar my-images/
# Upload the .tar file
```

### Video Datasets

Use the built-in video pipeline for processing raw videos. The pipeline consists of individual stages:

```bash
# See pipelines/video-dataset/ for individual scripts:
# ingest.py, segment.py, validate.py, annotate.py,
# audio_process.py, export.py, publish.py
#
# Configuration is in pipelines/video-dataset/config.yaml
```

## Dataset Versioning

Every upload creates an immutable version. You can:
- View all versions of a dataset
- Pin a training job to a specific version
- Compare schemas between versions
- Roll back to a previous version

## Best Practices

1. **Use Parquet** for tabular data (columnar, compressed, typed)
2. **Use WebDataset** (`.tar`) for image/video/audio datasets
3. **Keep datasets immutable** -- create new versions instead of overwriting
4. **Add descriptions** -- future-you will thank present-you
5. **Start with a subset** -- test your pipeline with 100 samples first
