import asyncio
import json

import aio_pika
import redis.asyncio as aioredis
from aio_pika import ExchangeType, DeliveryMode, Message
from aio_pika.abc import AbstractRobustConnection

from config import settings
from deduplication import is_duplicate, derive_message_id
from logger import get_logger

logger = get_logger("notification-service")
EXCHANGE_NAME = "turtle.events"
DLX_EXCHANGE_NAME = "turtle.dlx"
MAX_RETRY_COUNT = 3
PREFETCH_COUNT = 10

_conn: AbstractRobustConnection | None = None
_redis: aioredis.Redis | None = None


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


async def _subscribe(channel, topic: str, queue_prefix: str, handler, exchange, dlx_exchange) -> None:
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
            "x-message-ttl": 7 * 24 * 60 * 60 * 1000,
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

                # Deduplicate — skip if already processed within the last hour
                msg_id = (msg.message_id or "") if msg.message_id else derive_message_id(data, topic)
                if _redis and await is_duplicate(_redis, msg_id):
                    logger.info("message_deduplicated", extra={"topic": topic, "message_id": msg_id})
                    return

                await handler(data)
            except Exception as e:
                logger.error(
                    "message_handler_error",
                    extra={"topic": topic, "error": str(e), "retry": retry_count},
                    exc_info=True,
                )
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
    logger.info("consumer_subscribed", extra={"topic": topic, "queue": queue_name, "dlq": dlq_name})


async def start_consumers() -> None:
    global _conn, _redis
    _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    _conn = await aio_pika.connect_robust(settings.rabbitmq_url)
    channel = await _conn.channel()
    await channel.set_qos(prefetch_count=PREFETCH_COUNT)

    exchange = await channel.declare_exchange(EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)
    dlx_exchange = await channel.declare_exchange(DLX_EXCHANGE_NAME, ExchangeType.TOPIC, durable=True)

    await _subscribe(channel, "auth.login.success", "notification-service-group", handle_login_success, exchange, dlx_exchange)
    await _subscribe(channel, "auth.login.failed", "notification-service-group", handle_login_failed, exchange, dlx_exchange)

    logger.info("all_consumers_ready")
    try:
        await asyncio.Future()  # block until cancelled
    finally:
        await _conn.close()
        logger.info("rabbitmq_connection_closed")
