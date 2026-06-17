"""S3 / MinIO download helpers.

Async-friendly via run_in_executor wrappers around boto3 (which is sync).
"""
from __future__ import annotations

import asyncio
import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import boto3
from botocore.client import Config as BotoConfig

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_S3_URL_RE = re.compile(r"^s3://(?P<bucket>[^/]+)/(?P<key>.+)$")


@dataclass(frozen=True)
class S3Object:
    bucket: str
    key: str

    @property
    def filename(self) -> str:
        return Path(self.key).name


def parse_s3_url(url: str) -> S3Object:
    """Accept s3://bucket/key OR https://endpoint/bucket/key style URLs."""
    if url.startswith("s3://"):
        m = _S3_URL_RE.match(url)
        if not m:
            raise ValueError(f"Malformed s3:// URL: {url}")
        return S3Object(bucket=m.group("bucket"), key=unquote(m.group("key")))

    parsed = urlparse(url)
    parts = parsed.path.lstrip("/").split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Cannot parse bucket/key from URL: {url}")
    bucket, key = parts
    return S3Object(bucket=bucket, key=unquote(key))


def _make_client() -> Any:
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.S3_ENDPOINT or None,
        aws_access_key_id=s.S3_ACCESS_KEY or None,
        aws_secret_access_key=s.S3_SECRET_KEY or None,
        region_name=s.S3_REGION,
        config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 3}),
    )


async def download_to_bytes(url: str) -> tuple[bytes, str]:
    """Download an object and return (bytes, filename)."""
    obj = parse_s3_url(url)
    loop = asyncio.get_running_loop()

    def _dl() -> bytes:
        client = _make_client()
        buf = io.BytesIO()
        client.download_fileobj(obj.bucket, obj.key, buf)
        return buf.getvalue()

    data = await loop.run_in_executor(None, _dl)
    logger.info("s3.download", url=url, bytes=len(data))
    return data, obj.filename


async def upload_bytes(bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    loop = asyncio.get_running_loop()

    def _up() -> None:
        client = _make_client()
        client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)

    await loop.run_in_executor(None, _up)
    return f"s3://{bucket}/{key}"
