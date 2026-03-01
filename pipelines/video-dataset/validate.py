"""Validate clips — reject bad ones (static, no audio, desync)."""

import logging
from typing import Optional

import numpy as np

from segment import Clip

logger = logging.getLogger(__name__)


def compute_motion_score(video_path: str, start: float, end: float) -> float:
    """Compute average frame-to-frame motion score for a clip."""
    import av

    container = av.open(video_path)
    stream = container.streams.video[0]
    fps = float(stream.average_rate or 24)

    start_pts = int(start * fps)
    end_pts = int(end * fps)

    diffs = []
    prev = None
    frame_idx = 0

    for frame in container.decode(video=0):
        if frame_idx < start_pts:
            frame_idx += 1
            continue
        if frame_idx >= end_pts:
            break

        arr = frame.to_ndarray(format="rgb24").astype(np.float32)
        arr = arr[::4, ::4, :]
        if prev is not None:
            diffs.append(np.abs(arr - prev).mean())
        prev = arr
        frame_idx += 1

    container.close()
    return float(np.mean(diffs)) if diffs else 0.0


def has_audio(video_path: str) -> bool:
    """Check if video has an audio stream."""
    import av
    try:
        container = av.open(video_path)
        has = len(container.streams.audio) > 0
        container.close()
        return has
    except Exception:
        return False


def validate_clip(clip: Clip, config: dict) -> bool:
    """Validate a clip against quality criteria.

    Returns True if clip passes validation.
    """
    min_motion = config.get("min_motion_score", 0.01)
    require_audio = config.get("require_audio", False)

    # Check motion
    motion = compute_motion_score(clip.source, clip.start_time, clip.end_time)
    if motion < min_motion:
        logger.debug(f"Clip {clip.clip_id} rejected: low motion ({motion:.4f})")
        return False

    # Check audio
    if require_audio and not has_audio(clip.source):
        logger.debug(f"Clip {clip.clip_id} rejected: no audio")
        return False

    return True
