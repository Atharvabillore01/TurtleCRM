FROM python:3.12-slim
WORKDIR /app

COPY services/meeting-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/logger/logger.py                .
COPY shared/db/                             ./db/
COPY services/meeting-service/config.py              .
COPY services/meeting-service/eventbus.py            .
COPY services/meeting-service/metrics.py             .
COPY services/meeting-service/firefly_client.py      .
COPY services/meeting-service/google_calendar_client.py .
COPY services/meeting-service/redis_client.py        .
COPY services/meeting-service/main.py                .
COPY services/meeting-service/db/           ./db/
COPY services/meeting-service/routes/       ./routes/
COPY services/meeting-service/workers/      ./workers/

EXPOSE 4004
CMD ["python", "main.py"]
