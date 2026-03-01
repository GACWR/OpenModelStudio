"""Download/ingest raw videos from various sources."""

import os
import logging
from pathlib import Path
from typing import List, Dict, Iterator

logger = logging.getLogger(__name__)


def ingest_local(path: str) -> Iterator[str]:
    """Yield video file paths from a local directory."""
    extensions = {".mp4", ".avi", ".mkv", ".mov", ".webm"}
    root = Path(path)
    if not root.exists():
        logger.warning(f"Local path does not exist: {path}")
        return
    for f in sorted(root.rglob("*")):
        if f.suffix.lower() in extensions:
            yield str(f)


def ingest_s3(bucket: str, prefix: str = "", s3_client=None) -> Iterator[Dict]:
    """Yield S3 object info for video files."""
    import boto3
    s3 = s3_client or boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")
    extensions = {".mp4", ".avi", ".mkv", ".mov", ".webm"}

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if any(key.lower().endswith(ext) for ext in extensions):
                yield {"bucket": bucket, "key": key, "size": obj["Size"]}


def download_s3_video(bucket: str, key: str, output_dir: str, s3_client=None) -> str:
    """Download a single video from S3."""
    import boto3
    s3 = s3_client or boto3.client("s3")
    os.makedirs(output_dir, exist_ok=True)
    local_path = os.path.join(output_dir, os.path.basename(key))
    s3.download_file(bucket, key, local_path)
    return local_path


def ingest(config: dict) -> Iterator[str]:
    """Main ingest generator — yields video file paths from all configured sources."""
    for source in config.get("sources", []):
        src_type = source.get("type", "local")
        if src_type == "local":
            yield from ingest_local(source["path"])
        elif src_type == "s3":
            tmp_dir = "/tmp/openmodelstudio_ingest"
            for obj in ingest_s3(source["bucket"], source.get("prefix", "")):
                path = download_s3_video(obj["bucket"], obj["key"], tmp_dir)
                yield path
        else:
            logger.warning(f"Unknown source type: {src_type}")
