FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/data /app/logs

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV DATABASE_PATH=/app/data/meeting_minutes.db

EXPOSE 5167

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5167/get-meetings || exit 1

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5167"]
