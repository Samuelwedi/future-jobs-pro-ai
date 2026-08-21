FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY service ./service
COPY models ./models
ENV LUCY_WAKE_MODEL=/app/models/lucy.onnx
EXPOSE 8787
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8787"]
