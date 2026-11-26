FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY forecast_ridge.py /app/forecast_ridge.py
COPY forecast.py .
ENTRYPOINT ["python", "forecast.py"]
