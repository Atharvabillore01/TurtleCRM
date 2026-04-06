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
        _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        _channel = await _connection.channel()
        _exchange = await _channel.declare_exchange(
            EXCHANGE_NAME, ExchangeType.TOPIC, durable=True
        )
        logger.info("[rabbitmq] publisher ready")
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
