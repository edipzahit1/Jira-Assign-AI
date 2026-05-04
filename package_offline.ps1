Write-Host "--- Jira Assign AI: Preparing Offline Package ---" -ForegroundColor Cyan

# 1. Build
Write-Host "[1/4] Building images (Internet connection required)..." -ForegroundColor Yellow
docker compose build
docker pull ankane/pgvector:latest

# 2. Save Backend
Write-Host "[2/4] Exporting backend image (backend_image.tar)..." -ForegroundColor Yellow
docker save -o backend_image.tar prod-backend:latest

# 3. Save Frontend
Write-Host "[3/4] Exporting frontend image (frontend_image.tar)..." -ForegroundColor Yellow
docker save -o frontend_image.tar prod-nginx:latest

# 4. Save Database (pgvector)
Write-Host "[4/4] Exporting database image (db_image.tar)..." -ForegroundColor Yellow
docker save -o db_image.tar ankane/pgvector:latest

Write-Host "--- PROCESS COMPLETED ---" -ForegroundColor Green
Write-Host "Transfer the following files to the target machine:"
Write-Host "1. backend_image.tar"
Write-Host "2. frontend_image.tar"
Write-Host "3. db_image.tar"
Write-Host "4. docker-compose.offline.yml"
Write-Host "5. .env.example"
Write-Host "6. README.md"
