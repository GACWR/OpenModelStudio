"""Streaming data loaders — NEVER loads full dataset into memory."""

import io
import logging
from typing import Optional, Iterator, Any, Dict

import numpy as np
import torch
from torch.utils.data import IterableDataset, DataLoader

logger = logging.getLogger(__name__)


class HuggingFaceStreamDataset(IterableDataset):
    """Stream from HuggingFace datasets with streaming=True."""

    def __init__(self, name: str, split: str = "train", transform=None):
        self.name = name
        self.split = split
        self.transform = transform

    def __iter__(self):
        from datasets import load_dataset
        ds = load_dataset(self.name, split=self.split, streaming=True)
        for item in ds:
            if self.transform:
                item = self.transform(item)
            yield item


class S3StreamDataset(IterableDataset):
    """Stream objects from an S3 prefix, paginating without loading all keys."""

    def __init__(self, bucket: str, prefix: str, s3_client=None, transform=None):
        self.bucket = bucket
        self.prefix = prefix
        self.transform = transform
        import boto3
        self.s3 = s3_client or boto3.client("s3")

    def __iter__(self):
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=self.prefix):
            for obj in page.get("Contents", []):
                resp = self.s3.get_object(Bucket=self.bucket, Key=obj["Key"])
                data = resp["Body"].read()
                item = {"key": obj["Key"], "data": data}
                if self.transform:
                    item = self.transform(item)
                yield item


class PostgresStreamDataset(IterableDataset):
    """Stream rows from PostgreSQL using server-side cursor."""

    def __init__(self, db_url: str, query: str, batch_size: int = 1000, transform=None):
        self.db_url = db_url
        self.query = query
        self.batch_size = batch_size
        self.transform = transform

    def __iter__(self):
        import psycopg2
        conn = psycopg2.connect(self.db_url)
        try:
            with conn.cursor(name="stream_cursor") as cur:
                cur.itersize = self.batch_size
                cur.execute(self.query)
                cols = [desc[0] for desc in cur.description]
                for row in cur:
                    item = dict(zip(cols, row))
                    if self.transform:
                        item = self.transform(item)
                    yield item
        finally:
            conn.close()


class VideoFrameDataset(IterableDataset):
    """Decode video frames on-the-fly using PyAV — never loads full video."""

    def __init__(self, video_paths: list, fps: int = 8, transform=None):
        self.video_paths = video_paths
        self.fps = fps
        self.transform = transform

    def __iter__(self):
        import av
        for path in self.video_paths:
            try:
                container = av.open(path)
                stream = container.streams.video[0]
                stream.codec_context.skip_frame = "NONKEY"
                for frame in container.decode(video=0):
                    img = frame.to_ndarray(format="rgb24")
                    item = {"frame": img, "pts": frame.pts, "source": path}
                    if self.transform:
                        item = self.transform(item)
                    yield item
                container.close()
            except Exception as e:
                logger.warning(f"Failed to decode {path}: {e}")


class AudioChunkDataset(IterableDataset):
    """Stream audio in chunks using soundfile."""

    def __init__(self, audio_paths: list, chunk_seconds: float = 5.0, sr: int = 16000, transform=None):
        self.audio_paths = audio_paths
        self.chunk_seconds = chunk_seconds
        self.sr = sr
        self.transform = transform

    def __iter__(self):
        import soundfile as sf
        chunk_size = int(self.chunk_seconds * self.sr)
        for path in self.audio_paths:
            try:
                with sf.SoundFile(path) as f:
                    while f.tell() < len(f):
                        data = f.read(chunk_size, dtype="float32")
                        if len(data) == 0:
                            break
                        item = {"audio": data, "sr": f.samplerate, "source": path}
                        if self.transform:
                            item = self.transform(item)
                        yield item
            except Exception as e:
                logger.warning(f"Failed to read audio {path}: {e}")


def create_dataloader(
    source_type: str,
    batch_size: int = 32,
    num_workers: int = 0,
    **kwargs,
) -> DataLoader:
    """Factory to create a streaming DataLoader.

    Args:
        source_type: 'huggingface', 's3', 'postgres', 'video', 'audio'
        batch_size: Batch size for the DataLoader.
        num_workers: Number of worker processes.
        **kwargs: Passed to the underlying dataset class.
    """
    dataset_map = {
        "huggingface": HuggingFaceStreamDataset,
        "s3": S3StreamDataset,
        "postgres": PostgresStreamDataset,
        "video": VideoFrameDataset,
        "audio": AudioChunkDataset,
    }
    if source_type not in dataset_map:
        raise ValueError(f"Unknown source_type: {source_type}. Choose from {list(dataset_map.keys())}")

    dataset = dataset_map[source_type](**kwargs)
    return DataLoader(dataset, batch_size=batch_size, num_workers=num_workers)
