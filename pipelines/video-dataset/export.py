"""Export final dataset: clip.mp4 + caption.json per sample."""

import json
import logging
import os
from pathlib import Path
from typing import Dict, Iterator

from segment import Clip

logger = logging.getLogger(__name__)


def export_clip_video(clip: Clip, output_path: str, fps: int = 24, resolution: tuple = (256, 256)):
    """Export a clip segment as a standalone MP4."""
    import av

    in_container = av.open(clip.source)
    out_container = av.open(output_path, mode="w")

    v_stream = out_container.add_stream("h264", rate=fps)
    v_stream.width = resolution[0]
    v_stream.height = resolution[1]

    in_stream = in_container.streams.video[0]
    in_fps = float(in_stream.average_rate or 24)

    start_frame = int(clip.start_time * in_fps)
    end_frame = int(clip.end_time * in_fps)
    frame_idx = 0

    for frame in in_container.decode(video=0):
        if frame_idx < start_frame:
            frame_idx += 1
            continue
        if frame_idx >= end_frame:
            break

        img = frame.to_image().resize(resolution)
        out_frame = av.VideoFrame.from_image(img)
        for packet in v_stream.encode(out_frame):
            out_container.mux(packet)
        frame_idx += 1

    for packet in v_stream.encode():
        out_container.mux(packet)

    in_container.close()
    out_container.close()


def export_sample(clip: Clip, caption: Dict, output_dir: str, config: dict):
    """Export a complete sample (video + caption JSON)."""
    os.makedirs(output_dir, exist_ok=True)

    clip_id = caption["clip_id"]
    video_path = os.path.join(output_dir, f"{clip_id}.mp4")
    json_path = os.path.join(output_dir, f"{clip_id}.json")

    fps = config.get("fps", 24)
    resolution = tuple(config.get("resolution", [256, 256]))

    # Export video
    export_clip_video(clip, video_path, fps=fps, resolution=resolution)

    # Add pipeline metadata to caption
    caption["fps"] = fps
    caption["resolution"] = list(resolution)
    caption["audio_sample_rate"] = config.get("audio_sample_rate", 16000)

    # Export caption
    with open(json_path, "w") as f:
        json.dump(caption, f, indent=2)

    logger.info(f"Exported: {clip_id}")
    return video_path, json_path
