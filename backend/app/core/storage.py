"""
Storage abstraction (spec section 18).

Swapping STORAGE_PROVIDER in .env from `local` to `r2` (or `s3`) is the
only change needed -- no application code above this layer changes.
"""
import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

import boto3

from app.core.config import get_settings

settings = get_settings()


class StorageBackend(ABC):
    @abstractmethod
    def save(self, file_bytes: bytes, filename: str, prefix: str = "") -> str:
        """Persist a file and return a storage_path that can be used to retrieve it later."""

    @abstractmethod
    def read(self, storage_path: str) -> bytes:
        """Return raw bytes for a previously stored file."""

    @abstractmethod
    def url(self, storage_path: str) -> str:
        """Return a URL/path the frontend can use to download/view the file."""


def _unique_name(filename: str) -> str:
    ext = Path(filename).suffix
    return f"{uuid.uuid4().hex}{ext}"


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save(self, file_bytes: bytes, filename: str, prefix: str = "") -> str:
        subdir = self.base_path / prefix
        subdir.mkdir(parents=True, exist_ok=True)
        unique = _unique_name(filename)
        path = subdir / unique
        path.write_bytes(file_bytes)
        return str(Path(prefix) / unique)

    def read(self, storage_path: str) -> bytes:
        return (self.base_path / storage_path).read_bytes()

    def url(self, storage_path: str) -> str:
        # Served by a static file route in main.py during development.
        return f"/files/{storage_path}"


class S3CompatibleStorage(StorageBackend):
    """Works for both Cloudflare R2 and AWS S3 -- both speak the S3 API."""

    def __init__(self, bucket: str, endpoint_url: str, access_key: str, secret_key: str):
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    def save(self, file_bytes: bytes, filename: str, prefix: str = "") -> str:
        unique = _unique_name(filename)
        key = f"{prefix}/{unique}" if prefix else unique
        self.client.put_object(Bucket=self.bucket, Key=key, Body=file_bytes)
        return key

    def read(self, storage_path: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=storage_path)
        return obj["Body"].read()

    def url(self, storage_path: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": storage_path},
            ExpiresIn=3600,
        )


def get_storage() -> StorageBackend:
    if settings.STORAGE_PROVIDER == "local":
        return LocalStorage(settings.STORAGE_LOCAL_PATH)
    if settings.STORAGE_PROVIDER in ("r2", "s3"):
        endpoint = settings.R2_ENDPOINT_URL or (
            f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
            if settings.STORAGE_PROVIDER == "r2"
            else ""
        )
        return S3CompatibleStorage(
            bucket=settings.R2_BUCKET_NAME,
            endpoint_url=endpoint,
            access_key=settings.R2_ACCESS_KEY_ID,
            secret_key=settings.R2_SECRET_ACCESS_KEY,
        )
    raise ValueError(f"Unknown STORAGE_PROVIDER: {settings.STORAGE_PROVIDER}")
