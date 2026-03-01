"""Upload/download artifacts and checkpoints to/from S3, with DB registration."""

import logging
import os
import uuid
from typing import Optional, Dict

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError

logger = logging.getLogger("openmodelstudio.artifacts")


class ArtifactManager:
    """Manages model artifacts and checkpoints in S3 with DB tracking."""

    def __init__(self, bucket: str, model_id: str, job_id: str, db_conn=None, s3_client=None):
        self.bucket = bucket
        self.model_id = model_id
        self.job_id = job_id
        self._db_conn = db_conn
        self._s3_available = True

        if s3_client:
            self.s3 = s3_client
        else:
            # Build S3 client with optional MinIO endpoint
            s3_endpoint = os.environ.get("S3_ENDPOINT", "")
            kwargs = {}
            if s3_endpoint:
                kwargs["endpoint_url"] = s3_endpoint
            try:
                self.s3 = boto3.client("s3", **kwargs)
            except Exception as e:
                logger.warning(f"Failed to create S3 client: {e}")
                self.s3 = None
                self._s3_available = False

    def _checkpoint_key(self, epoch: Optional[int] = None) -> str:
        if epoch is not None:
            return f"models/{self.model_id}/checkpoints/epoch_{epoch:04d}.pt"
        return f"models/{self.model_id}/checkpoints/latest.pt"

    def upload_checkpoint(self, data: bytes, epoch: Optional[int] = None, metadata: Optional[Dict] = None):
        key = self._checkpoint_key(epoch)
        extra = {}
        if metadata:
            extra["Metadata"] = {k: str(v) for k, v in metadata.items()}

        if self._s3_available and self.s3:
            try:
                self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
                if epoch is not None:
                    self.s3.put_object(Bucket=self.bucket, Key=self._checkpoint_key(None), Body=data, **extra)
                logger.info(f"Uploaded checkpoint: {key}")
            except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
                logger.warning(f"S3 upload failed (no S3 configured?): {e}")
        else:
            logger.warning("S3 not available, skipping checkpoint upload")

        # Register in DB
        self._register_artifact(f"checkpoint_epoch_{epoch}" if epoch else "checkpoint_latest", "checkpoint", key, len(data))

    def download_checkpoint(self, epoch: Optional[int] = None) -> bytes:
        key = self._checkpoint_key(epoch)
        if not self._s3_available or not self.s3:
            raise RuntimeError("S3 not available for checkpoint download")
        try:
            resp = self.s3.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchKey":
                raise FileNotFoundError(f"Checkpoint not found: {key}")
            raise

    def upload_artifact(self, name: str, data: bytes, mime_type: Optional[str] = None, artifact_type: str = "artifact"):
        key = f"artifacts/{self.job_id}/{uuid.uuid4()}"
        extra = {}
        if mime_type:
            extra["ContentType"] = mime_type

        if self._s3_available and self.s3:
            try:
                self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
                logger.info(f"Uploaded artifact: {key} ({len(data)} bytes)")
            except (ClientError, NoCredentialsError, EndpointConnectionError) as e:
                logger.warning(f"S3 upload failed (no S3 configured?): {e}")
        else:
            logger.warning(f"S3 not available, skipping artifact upload for {name}")

        # Register in DB
        self._register_artifact(name, artifact_type, key, len(data))

    def _register_artifact(self, name: str, artifact_type: str, s3_key: str, size_bytes: int):
        """Insert artifact record into PostgreSQL."""
        if not self._db_conn:
            return
        try:
            with self._db_conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO artifacts (id, job_id, name, artifact_type, s3_key, size_bytes, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, NOW())",
                    (str(uuid.uuid4()), self.job_id, name, artifact_type, s3_key, size_bytes),
                )
            self._db_conn.commit()
            logger.info(f"Registered artifact in DB: {name}")
        except Exception as e:
            logger.warning(f"Failed to register artifact in DB: {e}")
            try:
                self._db_conn.rollback()
            except Exception:
                pass

    def list_checkpoints(self):
        prefix = f"models/{self.model_id}/checkpoints/"
        if not self._s3_available or not self.s3:
            return []
        paginator = self.s3.get_paginator("list_objects_v2")
        results = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                results.append(obj["Key"])
        return results
