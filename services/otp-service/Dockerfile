FROM python:3.12-slim
WORKDIR /app

COPY services/otp-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/otp-service/config.py        .
COPY services/otp-service/redis_client.py  .
COPY services/otp-service/eventbus.py      .
COPY services/otp-service/consumer.py      .
COPY services/otp-service/main.py          .
COPY services/otp-service/otp/             ./otp/
COPY services/otp-service/providers/       ./providers/

EXPOSE 4001
CMD ["python", "main.py"]
