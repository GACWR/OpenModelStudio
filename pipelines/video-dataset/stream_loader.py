"""HuggingFace-compatible streaming dataset class for video clips.

Supports local iteration, S3 streaming, HuggingFace Hub publishing,
and WebDataset export for tar-based streaming.
"""

import io
import json
import os
import logging
import tarfile
from pathlib import Path
from typing import Iterator, Dict, Optional, List

import numpy as np
from torch.utils.data import IterableDataset

logger = logging.getLogger(__name__)


class VideoClipStreamDataset(IterableDataset):
    """Streaming dataset that yields video clips + captions without loading all to memory.

    Compatible with HuggingFace datasets and PyTorch DataLoader.
    Iterates over exported clip directories or S3 prefixes.
    """

    def __init__(
        self,
        data_dir: str = None,
        s3_bucket: str = None,
        s3_prefix: str = None,
        decode_video: bool = True,
        max_frames: int = 64,
        target_fps: int = 8,
    ):
        self.data_dir = data_dir
        self.s3_bucket = s3_bucket
        self.s3_prefix = s3_prefix
        self.decode_video = decode_video
        self.max_frames = max_frames
        self.target_fps = target_fps

    def _iter_local(self) -> Iterator[Dict]:
        """Iterate over local exported clips."""
        root = Path(self.data_dir)
        json_files = sorted(root.glob("*.json"))

        for json_path in json_files:
            clip_id = json_path.stem
            video_path = json_path.with_suffix(".mp4")

            with open(json_path) as f:
                caption = json.load(f)

            sample = {"caption": caption, "clip_id": clip_id}

            if self.decode_video and video_path.exists():
                sample["frames"] = self._decode_video(str(video_path))

            # Load audio tokens if present
            audio_path = json_path.with_suffix(".audio.json")
            if audio_path.exists():
                with open(audio_path) as f:
                    sample["audio"] = json.load(f)

            yield sample

    def _iter_s3(self) -> Iterator[Dict]:
        """Stream clips from S3 without downloading entire dataset."""
        import boto3
        s3 = boto3.client("s3")
        paginator = s3.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=self.s3_bucket, Prefix=self.s3_prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(".json") or key.endswith(".audio.json"):
                    continue

                resp = s3.get_object(Bucket=self.s3_bucket, Key=key)
                caption = json.loads(resp["Body"].read())
                sample = {"caption": caption, "clip_id": caption.get("clip_id", "")}

                if self.decode_video:
                    video_key = key.replace(".json", ".mp4")
                    try:
                        import tempfile
                        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                        s3.download_file(self.s3_bucket, video_key, tmp.name)
                        sample["frames"] = self._decode_video(tmp.name)
                        os.unlink(tmp.name)
                    except Exception as e:
                        logger.warning(f"Failed to decode {video_key}: {e}")

                yield sample

    def _decode_video(self, path: str) -> np.ndarray:
        """Decode video frames on-the-fly using PyAV."""
        import av

        container = av.open(path)
        stream = container.streams.video[0]
        src_fps = float(stream.average_rate or 24)
        skip = max(1, int(src_fps / self.target_fps))

        frames = []
        for i, frame in enumerate(container.decode(video=0)):
            if i % skip != 0:
                continue
            arr = frame.to_ndarray(format="rgb24")
            frames.append(arr)
            if len(frames) >= self.max_frames:
                break

        container.close()

        if not frames:
            return np.zeros((1, 64, 64, 3), dtype=np.uint8)
        return np.stack(frames)

    def __iter__(self):
        if self.data_dir:
            yield from self._iter_local()
        elif self.s3_bucket:
            yield from self._iter_s3()
        else:
            raise ValueError("Must specify data_dir or s3_bucket")


# ---------------------------------------------------------------------------
# HuggingFace Hub publishing
# ---------------------------------------------------------------------------

def publish_to_hub(
    data_dir: str,
    repo_id: str,
    token: Optional[str] = None,
    private: bool = False,
    max_shard_size: str = "500MB",
):
    """Publish processed dataset directory to HuggingFace Hub.

    Converts the clip directory (JSON + MP4 files) into a HuggingFace Dataset
    and pushes to the Hub with resumable uploads.

    Args:
        data_dir: Path to processed clips directory
        repo_id: HuggingFace repo id, e.g. "myorg/my-video-dataset"
        token: HF API token (or set HF_TOKEN env var)
        private: Whether to make the repo private
        max_shard_size: Max shard size for parquet files
    """
    from datasets import Dataset, Features, Value, Sequence, Image, Audio

    root = Path(data_dir)
    records = []

    for json_path in sorted(root.glob("*.json")):
        if json_path.name.endswith(".audio.json"):
            continue
        clip_id = json_path.stem
        video_path = json_path.with_suffix(".mp4")

        with open(json_path) as f:
            caption = json.load(f)

        record = {
            "clip_id": clip_id,
            "visual_caption": caption.get("visual", ""),
            "audio_label": caption.get("audio", ""),
            "speech_transcript": caption.get("speech", ""),
            "duration_seconds": caption.get("duration_seconds", 0.0),
            "fps": caption.get("fps", 24),
        }

        # Include video bytes for HF dataset
        if video_path.exists():
            record["video_path"] = str(video_path)

        # Include audio tokens if available
        audio_json = json_path.with_suffix(".audio.json")
        if audio_json.exists():
            with open(audio_json) as f:
                audio_data = json.load(f)
            record["audio_tokens"] = json.dumps(audio_data.get("audio_tokens", []))
            record["codec"] = audio_data.get("codec", "")
            record["num_codebooks"] = audio_data.get("num_codebooks", 0)

        records.append(record)

    if not records:
        raise ValueError(f"No clips found in {data_dir}")

    ds = Dataset.from_list(records)

    token = token or os.environ.get("HF_TOKEN")
    logger.info(f"Pushing {len(records)} samples to {repo_id}")
    ds.push_to_hub(
        repo_id,
        token=token,
        private=private,
        max_shard_size=max_shard_size,
    )
    logger.info(f"Published to https://huggingface.co/datasets/{repo_id}")


# ---------------------------------------------------------------------------
# WebDataset export
# ---------------------------------------------------------------------------

def export_to_webdataset(
    data_dir: str,
    output_path: str,
    samples_per_shard: int = 1000,
):
    """Export processed dataset to WebDataset tar format for streaming.

    Creates tar files with the structure:
        clip_id.mp4  - video file
        clip_id.json - caption/metadata
        clip_id.audio.json - audio tokens (if available)

    Args:
        data_dir: Path to processed clips directory
        output_path: Output directory for tar shards
        samples_per_shard: Number of samples per tar shard
    """
    root = Path(data_dir)
    out = Path(output_path)
    out.mkdir(parents=True, exist_ok=True)

    json_files = sorted(root.glob("*.json"))
    json_files = [f for f in json_files if not f.name.endswith(".audio.json")]

    shard_idx = 0
    sample_count = 0
    tar = None

    for json_path in json_files:
        if sample_count % samples_per_shard == 0:
            if tar is not None:
                tar.close()
            shard_name = f"shard-{shard_idx:06d}.tar"
            tar = tarfile.open(out / shard_name, "w")
            shard_idx += 1

        clip_id = json_path.stem

        # Add JSON metadata
        tar.add(str(json_path), arcname=f"{clip_id}.json")

        # Add video
        video_path = json_path.with_suffix(".mp4")
        if video_path.exists():
            tar.add(str(video_path), arcname=f"{clip_id}.mp4")

        # Add audio tokens
        audio_path = json_path.with_suffix(".audio.json")
        if audio_path.exists():
            tar.add(str(audio_path), arcname=f"{clip_id}.audio.json")

        sample_count += 1

    if tar is not None:
        tar.close()

    logger.info(f"Exported {sample_count} samples in {shard_idx} shards to {output_path}")


# ---------------------------------------------------------------------------
# HuggingFace datasets integration (for load_dataset streaming)
# ---------------------------------------------------------------------------

def load_as_hf_dataset(data_dir: str, streaming: bool = False):
    """Load local processed dataset as a HuggingFace Dataset object.

    Supports `streaming=True` for lazy iteration.

    Args:
        data_dir: Path to processed clips directory
        streaming: If True, returns an IterableDataset
    """
    from datasets import load_dataset

    # Create a dataset loading script-compatible structure
    # Use json files as the dataset
    return load_dataset(
        "json",
        data_files=str(Path(data_dir) / "*.json"),
        streaming=streaming,
    )
