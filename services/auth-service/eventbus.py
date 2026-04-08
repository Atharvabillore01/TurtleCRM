import asyncio
import json
import logging

import aio_pika
from aio_pika import ExchangeType, Message, DeliveryMode
from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange

from config import settings

logger = logging.getLogger(__name__)

EXCHANGE_NAME = "turtle.events"

_connection: AbstractRobustConnection | None = None
_channel: AbstractChannel | None = None
_exchange: AbstractExchange | None = None


async def _get_exchange() -> AbstractExchange:
    global _connection, _channel, _exchange
    if _exchange is None:
        last_err: Exception | None = None
        for attempt in range(1, 11):
            try:
                _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
                _channel = await _connection.channel()
                _exchange = await _channel.declare_exchange(
                    EXCHANGE_NAME, ExchangeType.TOPIC, durable=True
                )
                logger.info("[rabbitmq] publisher ready")
                return _exchange
            except Exception as e:
                last_err = e
                wait = min(2 ** attempt, 30)
                logger.warning(f"[rabbitmq] connect attempt {attempt}/10 failed: {e} — retrying in {wait}s")
                await asyncio.sleep(wait)
        raise RuntimeError(f"[rabbitmq] could not connect after 10 attempts: {last_err}")
    return _exchange


async def publish_event(topic: str, payload: dict) -> None:
    exchange = await _get_exchange()
    await exchange.publish(
        Message(
            body=json.dumps(payload).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        ),
        routing_key=topic,
    )
    logger.debug(f"[rabbitmq] published → {topic}")


async def disconnect() -> None:
    global _connection, _channel, _exchange
    _exchange = None
    if _channel:
        try:
            await _channel.close()
        except Exception:
            pass
    if _connection:
        try:
            await _connection.close()
        except Exception:
            pass
    _channel = None
    _connection = None
    logger.info("[rabbitmq] publisher disconnected")
