#!/usr/bin/env python3
"""Publish processed video dataset to HuggingFace Hub.

Usage:
    python publish.py --data-dir /path/to/processed --repo-id myorg/my-dataset
    python publish.py --data-dir /path/to/processed --repo-id myorg/my-dataset --private
    python publish.py --data-dir /path/to/processed --webdataset --output-dir ./wds_shards
"""

import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Publish processed dataset")
    parser.add_argument("--data-dir", required=True, help="Path to processed clips directory")
    parser.add_argument("--repo-id", help="HuggingFace repo id (e.g. myorg/my-video-dataset)")
    parser.add_argument("--token", help="HuggingFace API token (or set HF_TOKEN env)")
    parser.add_argument("--private", action="store_true", help="Make HF repo private")
    parser.add_argument("--max-shard-size", default="500MB", help="Max shard size for HF upload")
    parser.add_argument("--webdataset", action="store_true", help="Export as WebDataset tar shards")
    parser.add_argument("--output-dir", default="./wds_shards", help="Output dir for WebDataset")
    parser.add_argument("--samples-per-shard", type=int, default=1000, help="Samples per WDS shard")

    args = parser.parse_args()

    from stream_loader import publish_to_hub, export_to_webdataset

    if args.webdataset:
        logger.info(f"Exporting WebDataset to {args.output_dir}")
        export_to_webdataset(
            data_dir=args.data_dir,
            output_path=args.output_dir,
            samples_per_shard=args.samples_per_shard,
        )

    if args.repo_id:
        logger.info(f"Publishing to HuggingFace Hub: {args.repo_id}")
        publish_to_hub(
            data_dir=args.data_dir,
            repo_id=args.repo_id,
            token=args.token,
            private=args.private,
            max_shard_size=args.max_shard_size,
        )

    if not args.webdataset and not args.repo_id:
        parser.error("Specify --repo-id for HF Hub upload and/or --webdataset for tar export")


if __name__ == "__main__":
    main()
