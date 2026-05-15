import asyncio
import json
import logging
from typing import Callable, Awaitable

import aio_pika
from aio_pika import ExchangeType, Message, DeliveryMode
from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange

from config import settings

logger = logging.getLogger(__name__)
EXCHANGE_NAME = "turtle.events"
DLX_EXCHANGE_NAME = "turtle.dlx"
MAX_RETRY_COUNT = 3
PREFETCH_COUNT = 10

_pub_connection: AbstractRobustConnection | None = None
_pub_channel: AbstractChannel | None = None
_pub_exchange: AbstractExchange | None = None


async def _get_pub_exchange() -> AbstractExchange:
    global _pub_connection, _pub_channel, _pub_exchange
    if _pub_exchange is None:
        last_err: Exception | None = None
        for attempt in range(1, 11):
            try:
                _pub_connection = await aio_pika.connect_robust(settings.rabbitmq_url)
                _pub_channel = await _pub_connection.channel()
                _pub_exchange = await _pub_channel.declare_exchange(
                    EXCHANGE_NAME, ExchangeType.TOPIC, durable=True
                )
                logger.info("[rabbitmq] publisher ready")
                return _pub_exchange
            except Exception as e:
                last_err = e
                wait = min(2 ** attempt, 30)
                logger.warning(f"[rabbitmq] connect attempt {attempt}/10 failed: {e} — retrying in {wait}s")
                await asyncio.sleep(wait)
        raise RuntimeError(f"[rabbitmq] could not connect after 10 attempts: {last_err}")
    return _pub_exchange


async def publish_event(topic: str, payload: dict) -> None:
    exchange = await _get_pub_exchange()
    await exchange.publish(
        Message(
            body=json.dumps(payload).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        ),
        routing_key=topic,
    )


async def start_consumer(
    topic: str,
    queue_prefix: str,
    handler: Callable[[dict], Awaitable[None]],
) -> None:
    """Connects, subscribes with DLQ support, and blocks until cancelled."""
    conn = await aio_pika.connect_robust(settings.rabbitmq_url)
    channel = await conn.channel()
    await channel.set_qos(prefetch_count=PREFETCH_COUNT)

    exchange = await channel.declare_exchange(EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)
    dlx_exchange = await channel.declare_exchange(DLX_EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)

    queue_name = f"{queue_prefix}.{topic}"
    dlq_name = f"{queue_name}.dlq"

    # Declare DLQ bound to dead-letter exchange
    dlq = await channel.declare_queue(dlq_name, durable=True, arguments={"x-queue-mode": "lazy"})
    await dlq.bind(dlx_exchange, routing_key=f"{topic}.failed")

    # Main queue with DLX routing
    queue = await channel.declare_queue(
        queue_name,
        durable=True,
        arguments={
            "x-message-ttl": settings.otp_expires_in_seconds * 1000,
            "x-dead-letter-exchange": DLX_EXCHANGE_NAME,
            "x-dead-letter-routing-key": f"{topic}.failed",
        },
    )
    await queue.bind(exchange, routing_key=topic)

    async def on_message(msg: aio_pika.IncomingMessage) -> None:
        retry_count = int(msg.headers.get("x-retry-count", 0)) if msg.headers else 0
        async with msg.process(requeue=False):
            try:
                data = json.loads(msg.body.decode())
                await handler(data)
            except Exception as e:
                logger.error(f"[rabbitmq] handler error on {topic} (attempt {retry_count + 1}): {e}", exc_info=True)
                if retry_count < MAX_RETRY_COUNT:
                    headers = dict(msg.headers) if msg.headers else {}
                    headers["x-retry-count"] = retry_count + 1
                    await exchange.publish(
                        Message(
                            body=msg.body,
                            headers=headers,
                            delivery_mode=DeliveryMode.PERSISTENT,
                            content_type="application/json",
                        ),
                        routing_key=topic,
                    )
                    logger.info(f"[rabbitmq] requeued {topic} (retry {retry_count + 1}/{MAX_RETRY_COUNT})")
                else:
                    logger.error(f"[rabbitmq] max retries reached for {topic}, routing to DLQ")
                    raise  # triggers nack → DLX routing

    await queue.consume(on_message)
    logger.info(f"[rabbitmq] consuming '{topic}' via queue '{queue_name}' (DLQ: '{dlq_name}')")

    try:
        await asyncio.Future()  # blocks until task is cancelled
    finally:
        await conn.close()


async def disconnect_publisher() -> None:
    global _pub_connection, _pub_channel, _pub_exchange
    _pub_exchange = None
    for obj in (_pub_channel, _pub_connection):
        if obj:
            try:
                await obj.close()
            except Exception:
                pass
    _pub_channel = None
    _pub_connection = None
