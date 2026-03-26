FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for msoffcrypto
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and pipeline scripts
COPY . .

# Create necessary directories
RUN mkdir -p pipeline/Recipes pipeline/temp_print

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
