"""Tests for the video dataset pipeline using synthetic data."""

import json
import os
import tempfile
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest


def create_synthetic_video(path: str, num_frames: int = 48, fps: int = 24, width: int = 64, height: int = 64):
    """Create a tiny synthetic video for testing."""
    import av

    container = av.open(path, mode="w")
    stream = container.add_stream("h264", rate=fps)
    stream.width = width
    stream.height = height

    for i in range(num_frames):
        # Create frame with some motion (shifting color)
        arr = np.zeros((height, width, 3), dtype=np.uint8)
        arr[:, :, 0] = (i * 5) % 256
        arr[:, :, 1] = (i * 10) % 256
        arr[i % height, :, 2] = 255  # Moving line

        frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
        for packet in stream.encode(frame):
            container.mux(packet)

    for packet in stream.encode():
        container.mux(packet)
    container.close()


@pytest.fixture
def synthetic_video(tmp_path):
    path = str(tmp_path / "test_video.mp4")
    create_synthetic_video(path, num_frames=72, fps=24)
    return path


class TestIngest:
    def test_ingest_local(self, synthetic_video, tmp_path):
        from ingest import ingest_local
        # Copy video to a directory
        import shutil
        video_dir = tmp_path / "videos"
        video_dir.mkdir()
        shutil.copy(synthetic_video, video_dir / "test.mp4")

        videos = list(ingest_local(str(video_dir)))
        assert len(videos) == 1
        assert videos[0].endswith(".mp4")


class TestSegment:
    def test_segment(self, synthetic_video):
        from segment import segment_video
        config = {"method": "frame_diff", "threshold": 5.0, "min_scene_len": 12, "clip_length_min": 0.5, "clip_length_max": 5.0}
        clips = list(segment_video(synthetic_video, config))
        assert len(clips) >= 1
        for clip in clips:
            assert clip.duration >= 0.5
            assert clip.end_time > clip.start_time


class TestAnnotate:
    def test_placeholder(self):
        from segment import Clip
        from annotate import annotate_clip
        clip = Clip(source="test.mp4", start_time=0.0, end_time=3.0, clip_id="test001")
        caption = annotate_clip(clip, {"method": "placeholder"})
        assert "clip_id" in caption
        assert "visual" in caption
        assert "audio" in caption
        assert caption["duration_seconds"] == 3.0


class TestStreamLoader:
    def test_local_streaming(self, tmp_path):
        from stream_loader import VideoClipStreamDataset

        # Create dummy exported data
        caption = {"clip_id": "abc123", "visual": "test", "audio": "test", "speech": "", "duration_seconds": 2.0}
        with open(tmp_path / "abc123.json", "w") as f:
            json.dump(caption, f)

        # Create tiny video
        create_synthetic_video(str(tmp_path / "abc123.mp4"), num_frames=12)

        dataset = VideoClipStreamDataset(data_dir=str(tmp_path), max_frames=8, target_fps=4)
        samples = list(dataset)
        assert len(samples) == 1
        assert samples[0]["clip_id"] == "abc123"
        assert "frames" in samples[0]
        assert samples[0]["frames"].ndim == 4  # (frames, H, W, 3)
