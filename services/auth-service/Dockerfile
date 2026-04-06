FROM python:3.12-slim
WORKDIR /app

COPY services/auth-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/logger/logger.py                .
COPY services/auth-service/config.py        .
COPY services/auth-service/redis_client.py  .
COPY services/auth-service/jwt_utils.py     .
COPY services/auth-service/eventbus.py      .
COPY services/auth-service/auth_utils.py    .
COPY services/auth-service/main.py          .
COPY services/auth-service/routes/          ./routes/

EXPOSE 4000
CMD ["python", "main.py"]
