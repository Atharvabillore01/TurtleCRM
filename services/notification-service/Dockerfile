FROM python:3.12-slim
WORKDIR /app

COPY services/notification-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/notification-service/config.py   .
COPY services/notification-service/consumer.py .
COPY services/notification-service/main.py     .

EXPOSE 4003
CMD ["python", "main.py"]
