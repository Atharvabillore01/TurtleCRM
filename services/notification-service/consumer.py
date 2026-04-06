import asyncio
import json

import aio_pika
from aio_pika import ExchangeType
from aio_pika.abc import AbstractRobustConnection

from logger import get_logger

logger = get_logger("notification-service")
EXCHANGE_NAME = "turtle.events"

_conn: AbstractRobustConnection | None = None


async def handle_login_success(payload: dict) -> None:
    logger.info(
        "login_success_notification",
        extra={
            "user_id": payload.get("userId"),
            "auth_method": payload.get("authMethod"),
            "user_type": payload.get("userType"),
            "ip": payload.get("ip"),
        },
    )


async def handle_login_failed(payload: dict) -> None:
    logger.warning(
        "login_failed_notification",
        extra={
            "user_id": payload.get("userId"),
            "reason": payload.get("reason"),
            "user_type": payload.get("userType"),
            "ip": payload.get("ip"),
        },
    )


async def _subscribe(channel, topic: str, queue_prefix: str, handler) -> None:
    exchange = await channel.declare_exchange(EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)
    queue_name = f"{queue_prefix}.{topic}"
    queue = await channel.declare_queue(
        queue_name,
        durable=True,
        arguments={"x-message-ttl": 7 * 24 * 60 * 60 * 1000},
    )
    await queue.bind(exchange, routing_key=topic)

    async def on_message(msg: aio_pika.IncomingMessage) -> None:
        async with msg.process(requeue=False):
            try:
                data = json.loads(msg.body.decode())
                await handler(data)
            except Exception as e:
                logger.error(
                    "message_handler_error",
                    extra={"topic": topic, "error": str(e)},
                    exc_info=True,
                )

    await queue.consume(on_message)
    logger.info("consumer_subscribed", extra={"topic": topic, "queue": queue_name})


async def start_consumers() -> None:
    global _conn
    _conn = await aio_pika.connect_robust(settings.rabbitmq_url)
    channel = await _conn.channel()
    await channel.set_qos(prefetch_count=1)

    await _subscribe(channel, "auth.login.success", "notification-service-group", handle_login_success)
    await _subscribe(channel, "auth.login.failed", "notification-service-group", handle_login_failed)

    logger.info("all_consumers_ready")
    try:
        await asyncio.Future()  # block until cancelled
    finally:
        await _conn.close()
        logger.info("rabbitmq_connection_closed")
