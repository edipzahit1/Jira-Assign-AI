#!/bin/bash

echo "--- Jira Assign AI: Preparing Offline Package ---"

# 1. Build
echo "[1/4] Building images (Internet connection required)..."
docker compose build
docker pull ankane/pgvector:latest

# 2. Save Backend
echo "[2/4] Exporting backend image (backend_image.tar)..."
docker save -o backend_image.tar prod-backend:latest

# 3. Save Frontend
echo "[3/4] Exporting frontend image (frontend_image.tar)..."
docker save -o frontend_image.tar prod-nginx:latest

# 4. Save Database (pgvector)
echo "[4/4] Exporting database image (db_image.tar)..."
docker save -o db_image.tar ankane/pgvector:latest

echo "--- PROCESS COMPLETED ---"
echo "Transfer the following files to the target machine:"
echo "1. backend_image.tar"
echo "2. frontend_image.tar"
echo "3. db_image.tar"
echo "4. docker-compose.offline.yml"
echo "5. .env.example"
echo "6. README.md"
