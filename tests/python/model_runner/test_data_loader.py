"""Tests for data_loader.create_dataloader and dataset classes."""

import pytest
from unittest.mock import MagicMock, patch
from torch.utils.data import DataLoader


class TestCreateDataloader:
    """Verify the create_dataloader() factory function."""

    @pytest.fixture(autouse=True)
    def _import_data_loader(self):
        from data_loader import (
            create_dataloader,
            HuggingFaceStreamDataset,
            S3StreamDataset,
            VideoFrameDataset,
            AudioChunkDataset,
        )
        self.create_dataloader = create_dataloader
        self.HuggingFaceStreamDataset = HuggingFaceStreamDataset
        self.S3StreamDataset = S3StreamDataset
        self.VideoFrameDataset = VideoFrameDataset
        self.AudioChunkDataset = AudioChunkDataset

    def test_create_dataloader_unknown_source(self):
        """Unknown source_type should raise ValueError."""
        with pytest.raises(ValueError, match="Unknown source_type"):
            self.create_dataloader("unknown")

    def test_create_dataloader_huggingface(self):
        """HuggingFace source type should return a DataLoader."""
        dl = self.create_dataloader("huggingface", name="test-dataset", split="train")
        assert isinstance(dl, DataLoader)

    def test_create_dataloader_s3(self):
        """S3 source type should return a DataLoader (with mock s3_client)."""
        dl = self.create_dataloader(
            "s3",
            bucket="test-bucket",
            prefix="data/",
            s3_client=MagicMock(),
        )
        assert isinstance(dl, DataLoader)

    # ── Individual dataset init tests ────────────────────────────────

    def test_huggingface_dataset_init(self):
        ds = self.HuggingFaceStreamDataset(name="squad", split="validation")
        assert ds.name == "squad"
        assert ds.split == "validation"

    def test_video_frame_dataset_init(self):
        ds = self.VideoFrameDataset(video_paths=["/tmp/a.mp4"], fps=24)
        assert ds.fps == 24

    def test_audio_chunk_dataset_init(self):
        ds = self.AudioChunkDataset(
            audio_paths=["/tmp/a.wav"], chunk_seconds=10.0, sr=24000
        )
        assert ds.sr == 24000
        assert ds.chunk_seconds == 10.0
