FROM python:3.12-slim
WORKDIR /app

COPY services/user-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/logger/logger.py           .
COPY services/user-service/config.py   .
COPY services/user-service/database.py .
COPY services/user-service/models.py   .
COPY services/user-service/main.py     .

EXPOSE 4002
CMD ["python", "main.py"]
