"""Segment long videos into 2-10s clips using shot detection."""

import logging
from typing import List, Tuple, Iterator, Dict
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Clip:
    source: str
    start_time: float
    end_time: float
    clip_id: str = ""

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


def detect_scenes_frame_diff(video_path: str, threshold: float = 30.0, min_scene_len: int = 48) -> List[float]:
    """Detect scene boundaries using frame-to-frame difference.

    Returns list of boundary timestamps in seconds.
    """
    import av

    container = av.open(video_path)
    stream = container.streams.video[0]
    fps = float(stream.average_rate or 24)

    boundaries = [0.0]
    prev_frame = None
    frame_idx = 0

    for frame in container.decode(video=0):
        arr = frame.to_ndarray(format="rgb24").astype(np.float32)
        # Downsample for speed
        arr = arr[::4, ::4, :]

        if prev_frame is not None:
            diff = np.abs(arr - prev_frame).mean()
            if diff > threshold and (frame_idx - int(boundaries[-1] * fps)) >= min_scene_len:
                boundaries.append(frame_idx / fps)

        prev_frame = arr
        frame_idx += 1

    # Add end
    duration = frame_idx / fps
    if duration > boundaries[-1]:
        boundaries.append(duration)

    container.close()
    return boundaries


def segment_video(video_path: str, config: dict) -> Iterator[Clip]:
    """Segment a video into clips based on config."""
    method = config.get("method", "frame_diff")
    threshold = config.get("threshold", 30.0)
    min_scene_len = config.get("min_scene_len", 48)
    clip_min = config.get("clip_length_min", 2.0)
    clip_max = config.get("clip_length_max", 10.0)

    if method == "frame_diff":
        boundaries = detect_scenes_frame_diff(video_path, threshold, min_scene_len)
    else:
        raise ValueError(f"Unknown segmentation method: {method}")

    clip_idx = 0
    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end = boundaries[i + 1]
        duration = end - start

        # Split long segments into max-length clips
        while duration > clip_max:
            clip = Clip(
                source=video_path,
                start_time=start,
                end_time=start + clip_max,
                clip_id=f"{clip_idx:06d}",
            )
            if clip.duration >= clip_min:
                yield clip
                clip_idx += 1
            start += clip_max
            duration = end - start

        if duration >= clip_min:
            yield Clip(source=video_path, start_time=start, end_time=end, clip_id=f"{clip_idx:06d}")
            clip_idx += 1
