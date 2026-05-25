FROM python:3.12-slim
WORKDIR /app

COPY turtle-crm-agent/turtle-crm-agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY turtle-crm-agent/turtle-crm-agent/ .

EXPOSE 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
