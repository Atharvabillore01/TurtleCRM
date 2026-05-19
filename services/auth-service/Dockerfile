FROM python:3.12-slim
WORKDIR /app

COPY services/auth-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/logger/logger.py                .
COPY shared/db/                             ./db/
COPY services/auth-service/db/              ./db/
COPY services/auth-service/config.py        .
COPY services/auth-service/redis_client.py  .
COPY services/auth-service/jwt_utils.py     .
COPY services/auth-service/eventbus.py      .
COPY services/auth-service/auth_utils.py    .
COPY services/auth-service/outbox.py        .
COPY services/auth-service/tracing.py       .
COPY services/auth-service/metrics.py       .
COPY services/auth-service/main.py          .
COPY services/auth-service/routes/          ./routes/
COPY services/auth-service/schemas/         ./schemas/
COPY services/auth-service/utils/           ./utils/
COPY services/auth-service/workers/         ./workers/

EXPOSE 4000
CMD ["python", "main.py"]
