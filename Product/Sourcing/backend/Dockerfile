FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for pdfplumber and psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libpoppler-cpp-dev poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model during build (avoids first-request delay)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY . .

RUN mkdir -p logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
