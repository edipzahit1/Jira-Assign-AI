# ---------- Stage: Build ----------
FROM python:3.11-slim AS builder

WORKDIR /app

# Build argument for the NLP model (defaults to MiniLM if not provided)
ARG SENTENCE_TRANSFORMER_MODEL=all-MiniLM-L6-v2

# Install build deps for numpy/scipy wheels
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ python3-dev libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model using the build argument so it's baked into the image
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${SENTENCE_TRANSFORMER_MODEL}')"

# ---------- Stage: Runtime ----------
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy the pre-downloaded model cache
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy application code
COPY . .

# Remove files not needed at runtime
RUN rm -rf __pycache__ *.db .encryption_key crash_debug.txt

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
