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
    logger.debug(f"[rabbitmq] published → {topic}")


async def start_consumer(
    topic: str,
    queue_prefix: str,
    handler: Callable[[dict], Awaitable[None]],
) -> None:
    conn = await aio_pika.connect_robust(settings.rabbitmq_url)
    channel = await conn.channel()
    await channel.set_qos(prefetch_count=1)

    exchange = await channel.declare_exchange(EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)

    queue_name = f"{queue_prefix}.{topic}"
    queue = await channel.declare_queue(queue_name, durable=True)
    await queue.bind(exchange, routing_key=topic)

    async def on_message(msg: aio_pika.IncomingMessage) -> None:
        async with msg.process(requeue=False):
            try:
                data = json.loads(msg.body.decode())
                await handler(data)
            except Exception as e:
                logger.error(f"[rabbitmq] handler error on {topic}: {e}", exc_info=True)

    await queue.consume(on_message)
    logger.info(f"[rabbitmq] consuming '{topic}' via queue '{queue_name}'")

    try:
        await asyncio.Future()
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
