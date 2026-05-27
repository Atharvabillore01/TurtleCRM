import time

from fastapi import Response
from prometheus_client import Counter, Histogram, generate_latest, REGISTRY

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
)

events_consumed_total = Counter(
    "events_consumed_total",
    "Total events consumed from RabbitMQ",
    ["event_type", "status"],
)

otp_sent_total = Counter(
    "otp_sent_total",
    "Total OTPs dispatched",
    ["channel", "provider", "status"],
)


async def metrics_middleware(request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    http_requests_total.labels(
        method=request.method,
        endpoint=request.url.path,
        status=str(response.status_code),
    ).inc()

    http_request_duration_seconds.labels(
        method=request.method,
        endpoint=request.url.path,
    ).observe(duration)

    return response


async def metrics_endpoint():
    return Response(content=generate_latest(REGISTRY), media_type="text/plain; version=0.0.4")
