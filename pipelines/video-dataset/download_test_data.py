#!/usr/bin/env python3
"""Download a small test dataset and run the full pipeline.

Uses a synthetic test approach: downloads a few Creative Commons videos from
archive.org and processes them through the full pipeline. This avoids the
complexity of MSR-VTT/VGG-Sound download authentication while still testing
the entire pipeline end-to-end.

For production datasets, use the HuggingFace datasets library:
    from datasets import load_dataset
    ds = load_dataset("AlexZigma/msr-vtt", split="train[:100]", streaming=True)

Usage:
    python download_test_data.py [--num-clips 10] [--annotate-method placeholder]
"""

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Small CC-licensed test videos from archive.org (< 50MB each)
TEST_VIDEOS = [
    {
        "url": "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        "name": "big_buck_bunny.mp4",
        "description": "Big Buck Bunny - CC animated short",
        "max_bytes": 50_000_000,  # only download first 50MB
    },
]

# Alternative: use HuggingFace datasets for real video datasets
HF_DATASETS = {
    "msr-vtt": {
        "path": "AlexZigma/msr-vtt",
        "split": "train",
        "max_samples": 100,
    },
}

BASE_DIR = Path(__file__).resolve().parent.parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"


def download_test_videos(num_videos: int = 1) -> list:
    """Download small test videos for pipeline testing."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = []

    for video_info in TEST_VIDEOS[:num_videos]:
        out_path = RAW_DIR / video_info["name"]
        if out_path.exists():
            logger.info(f"Already downloaded: {out_path}")
            downloaded.append(str(out_path))
            continue

        url = video_info["url"]
        max_bytes = video_info.get("max_bytes", 100_000_000)
        logger.info(f"Downloading {video_info['name']} (max {max_bytes // 1_000_000}MB)...")

        try:
            import requests
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()

            total = 0
            with open(out_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
                    total += len(chunk)
                    if total >= max_bytes:
                        logger.info(f"Reached {max_bytes // 1_000_000}MB limit, truncating")
                        break

            downloaded.append(str(out_path))
            logger.info(f"Downloaded: {out_path} ({total // 1_000_000}MB)")

        except Exception as e:
            logger.error(f"Failed to download {url}: {e}")
            # Create a synthetic test video with ffmpeg as fallback
            logger.info("Creating synthetic test video with ffmpeg...")
            try:
                subprocess.run([
                    "ffmpeg", "-y", "-f", "lavfi", "-i",
                    "testsrc=duration=30:size=256x256:rate=24",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
                    "-c:v", "libx264", "-c:a", "aac", "-shortest",
                    str(out_path),
                ], check=True, capture_output=True)
                downloaded.append(str(out_path))
                logger.info(f"Created synthetic test video: {out_path}")
            except Exception as e2:
                logger.error(f"ffmpeg fallback also failed: {e2}")

    return downloaded


def try_hf_dataset(dataset_name: str = "msr-vtt", max_samples: int = 100) -> list:
    """Try to download clips from a HuggingFace dataset."""
    try:
        from datasets import load_dataset

        info = HF_DATASETS.get(dataset_name)
        if not info:
            logger.warning(f"Unknown HF dataset: {dataset_name}")
            return []

        logger.info(f"Loading {dataset_name} from HuggingFace (streaming)...")
        ds = load_dataset(info["path"], split=info["split"], streaming=True)

        RAW_DIR.mkdir(parents=True, exist_ok=True)
        downloaded = []
        for i, sample in enumerate(ds):
            if i >= max_samples:
                break
            # Dataset-specific extraction would go here
            # Most video datasets on HF store video bytes or paths
            logger.info(f"Sample {i}: {list(sample.keys())}")

        return downloaded
    except Exception as e:
        logger.warning(f"HF dataset loading failed: {e}")
        return []


def run_pipeline(video_paths: list, config_overrides: dict = None):
    """Run the full pipeline on downloaded videos."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    import yaml
    from segment import segment_video
    from annotate import annotate_clip
    from audio_process import process_clip_audio
    from export import export_sample

    # Load config
    config_path = Path(__file__).resolve().parent / "config.yaml"
    with open(config_path) as f:
        config = yaml.safe_load(f)

    if config_overrides:
        for key, val in config_overrides.items():
            if "." in key:
                section, k = key.split(".", 1)
                config.setdefault(section, {})[k] = val
            else:
                config[key] = val

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output_dir = str(PROCESSED_DIR)

    total_clips = 0
    for video_path in video_paths:
        logger.info(f"Processing: {video_path}")

        # 1. Segment
        seg_config = {**config.get("pipeline", {}), **config.get("segment", {})}
        clips = list(segment_video(video_path, seg_config))
        logger.info(f"  Segmented into {len(clips)} clips")

        for clip in clips[:50]:  # Limit for testing
            # 2. Annotate
            caption = annotate_clip(clip, config.get("annotate", {}))

            # 3. Audio processing
            audio_config = config.get("audio", {})
            audio_config["tokenize_audio"] = config_overrides.get("tokenize_audio", False) if config_overrides else False
            audio_data = process_clip_audio(clip, audio_config)

            # Merge audio data into caption
            caption.update({k: v for k, v in audio_data.items() if k != "has_audio"})

            # 4. Export
            export_sample(clip, caption, output_dir, config.get("pipeline", {}))
            total_clips += 1

    logger.info(f"Pipeline complete: {total_clips} clips exported to {output_dir}")
    return total_clips


def verify_streaming(data_dir: str):
    """Verify the streaming loader can iterate over the result."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from stream_loader import VideoClipStreamDataset

    dataset = VideoClipStreamDataset(data_dir=data_dir, decode_video=False)
    count = 0
    for sample in dataset:
        count += 1
        if count <= 3:
            logger.info(f"  Sample {count}: clip_id={sample['clip_id']}, "
                        f"caption_visual={sample['caption'].get('visual', '')[:60]}...")

    logger.info(f"Streaming verification: {count} samples iterable ✓")
    return count


def main():
    parser = argparse.ArgumentParser(description="Download test data and run pipeline")
    parser.add_argument("--num-clips", type=int, default=50, help="Max clips to process")
    parser.add_argument("--annotate-method", default="placeholder",
                        help="Annotation method: placeholder, vlm, openai")
    parser.add_argument("--tokenize-audio", action="store_true", help="Run EnCodec tokenization")
    parser.add_argument("--use-hf", action="store_true", help="Try HuggingFace dataset first")
    parser.add_argument("--hf-dataset", default="msr-vtt", help="HF dataset name")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("OpenModelStudio Pipeline Test")
    logger.info("=" * 60)

    # Step 1: Download test data
    video_paths = []
    if args.use_hf:
        video_paths = try_hf_dataset(args.hf_dataset)

    if not video_paths:
        video_paths = download_test_videos()

    if not video_paths:
        logger.error("No test videos available!")
        sys.exit(1)

    # Step 2: Run pipeline
    overrides = {
        "annotate.method": args.annotate_method,
        "tokenize_audio": args.tokenize_audio,
    }
    num_clips = run_pipeline(video_paths, config_overrides=overrides)

    if num_clips == 0:
        logger.error("No clips produced!")
        sys.exit(1)

    # Step 3: Verify streaming
    verify_streaming(str(PROCESSED_DIR))

    logger.info("=" * 60)
    logger.info("✓ Pipeline test complete!")
    logger.info(f"  Raw data:      {RAW_DIR}")
    logger.info(f"  Processed:     {PROCESSED_DIR}")
    logger.info(f"  Total clips:   {num_clips}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
