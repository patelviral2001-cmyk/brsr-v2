"""Feedback consumer — runs as a separate process.

Drains the Redis stream `feedback:hitl`, accumulates corrections in-memory, and
once per night (or on graceful shutdown) writes a JSONL dataset to S3 for the
fine-tuning pipeline.

Run with:
    python -m app.queue.feedback_consumer
"""
from __future__ import annotations

import asyncio
import json
import signal
import time
from datetime import datetime, timezone
from typing import Any

import boto3
from redis.asyncio import Redis

from app.config import get_settings
from app.utils.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("queue.feedback_consumer")

STREAM = "feedback:hitl"
GROUP = "ai-engine-feedback"
CONSUMER = "consumer-1"
BATCH_SIZE = 64
FLUSH_INTERVAL_SECONDS = 60 * 60  # flush hourly; nightly job runs externally too


class FeedbackConsumer:
    def __init__(self) -> None:
        self.s = get_settings()
        self.redis = Redis.from_url(self.s.REDIS_URL, decode_responses=True)
        self.buffer: list[dict[str, Any]] = []
        self.last_flush = time.time()
        self._stopped = False

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(STREAM, GROUP, id="0-0", mkstream=True)
        except Exception as e:  # noqa: BLE001
            if "BUSYGROUP" not in str(e):
                logger.warning("feedback.group_create_failed", err=str(e))

    async def run(self) -> None:
        await self.ensure_group()
        logger.info("feedback.consumer.started", stream=STREAM, group=GROUP)
        while not self._stopped:
            try:
                resp = await self.redis.xreadgroup(
                    groupname=GROUP,
                    consumername=CONSUMER,
                    streams={STREAM: ">"},
                    count=BATCH_SIZE,
                    block=5000,
                )
                if resp:
                    for _stream, messages in resp:
                        for msg_id, fields in messages:
                            self._handle(msg_id, fields)
                            await self.redis.xack(STREAM, GROUP, msg_id)
                if time.time() - self.last_flush > FLUSH_INTERVAL_SECONDS:
                    await self._flush_to_s3()
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                logger.exception("feedback.consumer.error", err=str(e))
                await asyncio.sleep(2.0)
        await self._flush_to_s3()
        await self.redis.aclose()
        logger.info("feedback.consumer.stopped")

    def stop(self, *_: Any) -> None:
        logger.info("feedback.consumer.stopping")
        self._stopped = True

    # ------------------------------------------------------------------
    def _handle(self, msg_id: str, fields: dict[str, str]) -> None:
        item: dict[str, Any] = {}
        for k, v in fields.items():
            try:
                item[k] = json.loads(v)
            except (TypeError, json.JSONDecodeError):
                item[k] = v
        item["_msg_id"] = msg_id
        self.buffer.append(item)
        logger.debug("feedback.buffered", msg_id=msg_id)

    async def _flush_to_s3(self) -> None:
        if not self.buffer:
            self.last_flush = time.time()
            return
        items = self.buffer
        self.buffer = []
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        key = f"fine-tuning/feedback/{timestamp}.jsonl"
        body = "\n".join(json.dumps(it, default=str) for it in items).encode("utf-8")

        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._sync_put, key, body)
            logger.info("feedback.flushed", count=len(items), s3_key=key)
        except Exception as e:  # noqa: BLE001
            logger.error("feedback.flush_failed", err=str(e))
            # Push back into the buffer so we don't lose data.
            self.buffer = items + self.buffer
        self.last_flush = time.time()

    def _sync_put(self, key: str, body: bytes) -> None:
        client = boto3.client(
            "s3",
            endpoint_url=self.s.S3_ENDPOINT or None,
            aws_access_key_id=self.s.S3_ACCESS_KEY or None,
            aws_secret_access_key=self.s.S3_SECRET_KEY or None,
            region_name=self.s.S3_REGION,
        )
        # Determine bucket — convention: BRSR_TRAINING_BUCKET env or fall back to "brsr-training"
        import os

        bucket = os.environ.get("BRSR_TRAINING_BUCKET", "brsr-training")
        client.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/x-ndjson")


def main() -> None:
    consumer = FeedbackConsumer()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, consumer.stop)
        except NotImplementedError:
            # Windows
            signal.signal(sig, consumer.stop)

    try:
        loop.run_until_complete(consumer.run())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
