"""Tests for artifact_manager.ArtifactManager."""

import pytest
from unittest.mock import MagicMock, patch


class TestArtifactManager:
    """Verify ArtifactManager checkpoint keys, S3 uploads, and DB registration."""

    @pytest.fixture(autouse=True)
    def _import_manager(self):
        """Import ArtifactManager with boto3 available."""
        from artifact_manager import ArtifactManager
        self.ArtifactManager = ArtifactManager

    def _make_manager(self, s3_available=True, db_conn=None, s3_client=None):
        if s3_client is None:
            s3_client = MagicMock() if s3_available else None
        mgr = self.ArtifactManager(
            bucket="test-bucket",
            model_id="model-001",
            job_id="job-002",
            db_conn=db_conn,
            s3_client=s3_client,
        )
        if not s3_available:
            mgr._s3_available = False
            mgr.s3 = None
        return mgr

    # ── Checkpoint key generation ────────────────────────────────────

    def test_checkpoint_key_with_epoch(self):
        mgr = self._make_manager()
        key = mgr._checkpoint_key(epoch=5)
        assert key == "models/model-001/checkpoints/epoch_0005.pt"

    def test_checkpoint_key_latest(self):
        mgr = self._make_manager()
        key = mgr._checkpoint_key()
        assert key == "models/model-001/checkpoints/latest.pt"

    # ── Upload with and without S3 ───────────────────────────────────

    def test_upload_checkpoint_no_s3(self):
        """When S3 is unavailable, logs warning but still registers in DB."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        mgr = self._make_manager(s3_available=False, db_conn=mock_conn)
        mgr.upload_checkpoint(b"fake-data", epoch=1)

        # Should still register in DB
        cursor.execute.assert_called()
        call_sql = cursor.execute.call_args[0][0]
        assert "INSERT INTO artifacts" in call_sql

    def test_register_artifact_in_db(self):
        """Verify the INSERT INTO artifacts SQL is called."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        mgr = self._make_manager(db_conn=mock_conn)
        mgr._register_artifact("test-artifact", "checkpoint", "s3://key", 1024)

        cursor.execute.assert_called_once()
        call_args = cursor.execute.call_args[0]
        assert "INSERT INTO artifacts" in call_args[0]
        # Verify the values tuple contains expected fields
        values = call_args[1]
        assert values[1] == "job-002"  # job_id
        assert values[2] == "test-artifact"  # name
        assert values[3] == "checkpoint"  # artifact_type
        assert values[4] == "s3://key"  # s3_key
        assert values[5] == 1024  # size_bytes

    def test_upload_artifact_with_s3(self):
        """When S3 is available, put_object should be called."""
        mock_s3 = MagicMock()
        mgr = self._make_manager(s3_client=mock_s3)
        mgr.upload_artifact("my-file", b"some-data", artifact_type="model_weights")
        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args
        assert call_kwargs[1]["Bucket"] == "test-bucket"
        assert call_kwargs[1]["Body"] == b"some-data"

    # ── Download without S3 ──────────────────────────────────────────

    def test_download_checkpoint_no_s3(self):
        """Raises RuntimeError when S3 is not available."""
        mgr = self._make_manager(s3_available=False)
        with pytest.raises(RuntimeError, match="S3 not available"):
            mgr.download_checkpoint(epoch=1)

    # ── List checkpoints without S3 ──────────────────────────────────

    def test_list_checkpoints_no_s3(self):
        """Returns empty list when S3 is not available."""
        mgr = self._make_manager(s3_available=False)
        result = mgr.list_checkpoints()
        assert result == []
