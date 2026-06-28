"""S3 / MinIO download helpers.

Async-friendly via run_in_executor wrappers around boto3 (which is sync).

Hardened for production:
  * 30s wall-clock timeout per S3 request (connect + read).
  * tenacity exponential-backoff retries on transient botocore errors.
  * Hard cap on object size to avoid loading multi-GB blobs into RAM.
  * Path-traversal-safe filename derivation.
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
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectionError as BotoConnectionError,
    EndpointConnectionError,
    ReadTimeoutError,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

_S3_URL_RE = re.compile(r"^s3://(?P<bucket>[^/]+)/(?P<key>.+)$")

# Hard guard — refuse to load > 100 MB into memory.
MAX_S3_BYTES = 100 * 1024 * 1024
S3_TIMEOUT_SECONDS = 30


class S3DownloadError(RuntimeError):
    """Surfaced when S3 download fails after all retries."""


class S3ObjectTooLargeError(S3DownloadError):
    """Object exceeds MAX_S3_BYTES."""


@dataclass(frozen=True)
class S3Object:
    bucket: str
    key: str

    @property
    def filename(self) -> str:
        # Use only the basename component to avoid path traversal via key.
        name = Path(self.key).name or "file.bin"
        # Strip any sneaky parent-dir references that survived basename().
        return name.replace("..", "_").replace("/", "_").replace("\\", "_")


def parse_s3_url(url: str) -> S3Object:
    """Accept s3://bucket/key OR https://endpoint/bucket/key style URLs."""
    if url.startswith("s3://"):
        m = _S3_URL_RE.match(url)
        if not m:
            raise ValueError(f"Malformed s3:// URL: {url}")
        return S3Object(bucket=m.group("bucket"), key=unquote(m.group("key")))

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")
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
        config=BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=S3_TIMEOUT_SECONDS,
            read_timeout=S3_TIMEOUT_SECONDS,
        ),
    )


_TRANSIENT_BOTO_ERRORS = (
    BotoConnectionError,
    EndpointConnectionError,
    ReadTimeoutError,
)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
    retry=retry_if_exception_type(_TRANSIENT_BOTO_ERRORS),
    reraise=True,
)
def _download_blocking(obj: S3Object) -> bytes:
    client = _make_client()
    # HEAD first — refuse early if the object is too big.
    try:
        head = client.head_object(Bucket=obj.bucket, Key=obj.key)
        size = int(head.get("ContentLength") or 0)
        if size > MAX_S3_BYTES:
            raise S3ObjectTooLargeError(
                f"S3 object {obj.bucket}/{obj.key} is {size} bytes; max={MAX_S3_BYTES}"
            )
    except ClientError:
        # HEAD denied — fall through; download_fileobj will fail loudly anyway.
        pass

    buf = io.BytesIO()
    client.download_fileobj(obj.bucket, obj.key, buf)
    data = buf.getvalue()
    if len(data) > MAX_S3_BYTES:
        raise S3ObjectTooLargeError(
            f"Downloaded {len(data)} bytes exceeds cap {MAX_S3_BYTES}"
        )
    return data


async def download_to_bytes(url: str) -> tuple[bytes, str]:
    """Download an object and return (bytes, filename).

    Raises:
        S3DownloadError on any unrecoverable failure (after retries).
        S3ObjectTooLargeError if the object exceeds MAX_S3_BYTES.
    """
    try:
        obj = parse_s3_url(url)
    except ValueError as e:
        raise S3DownloadError(f"invalid s3 url: {e}") from e

    loop = asyncio.get_running_loop()
    try:
        data = await asyncio.wait_for(
            loop.run_in_executor(None, _download_blocking, obj),
            timeout=S3_TIMEOUT_SECONDS * 4,  # outer cap covers worst-case retries.
        )
    except asyncio.TimeoutError as e:
        raise S3DownloadError(f"S3 download timed out for {url}") from e
    except S3ObjectTooLargeError:
        raise
    except (BotoCoreError, ClientError) as e:
        raise S3DownloadError(f"S3 download failed for {url}: {e}") from e

    logger.info("s3.download", url=url, bytes=len(data))
    return data, obj.filename


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=8.0),
    retry=retry_if_exception_type(_TRANSIENT_BOTO_ERRORS),
    reraise=True,
)
def _upload_blocking(bucket: str, key: str, data: bytes, content_type: str) -> None:
    client = _make_client()
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)


async def upload_bytes(bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    loop = asyncio.get_running_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, _upload_blocking, bucket, key, data, content_type),
            timeout=S3_TIMEOUT_SECONDS * 4,
        )
    except asyncio.TimeoutError as e:
        raise S3DownloadError(f"S3 upload timed out for {bucket}/{key}") from e
    except (BotoCoreError, ClientError) as e:
        raise S3DownloadError(f"S3 upload failed for {bucket}/{key}: {e}") from e
    return f"s3://{bucket}/{key}"
