# Jira Assign AI

**Jira Assign AI** is an enterprise-grade automation solution designed to optimize task distribution on Jira using Artificial Intelligence and NLP (Natural Language Processing). It ensures the right task is assigned to the right developer based on semantic expertise, workload, and performance metrics.

---

## 🛠 Technology Stack

### **Backend**
- **Framework:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) for vector similarity search.
- **Security:** JWT Authentication + AES-256 (Fernet) encryption for Jira tokens.
- **AI/NLP:** Sentence-Transformers (`all-MiniLM-L6-v2`) for semantic ticket analysis.

### **Frontend**
- **Framework:** React + Vite + TailwindCSS
- **Visualization:** Enterprise Gantt Roadmap & Developer Capacity Analytics.

### **Infrastructure**
- **Containerization:** Docker & Docker Compose
- **Web Server:** Nginx (Reverse Proxy)

---

## ✨ Key Features
1. **AI-Powered Recommendation:** Matches ticket descriptions with developer history in a vector space.
2. **Tiered Synchronization:** Supports daily incremental, weekly reconciliation, and monthly full re-embedding.
3. **Enterprise Security:** Secure cookie handling, CORS protection, and encrypted credential storage.
4. **Air-Gapped Ready:** Specifically designed for deployment in restricted corporate networks.

---

## 🚀 Deployment Guide

### **Prerequisites**
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux) must be installed.
- Ensure the Docker daemon is running before starting the process.

### **Phase 1: Preparation (Machine with Internet Access)**
Use this phase to fetch the source code and prepare the portable deployment package.

1. **Clone the Repository:**
   ```bash
   git clone git@github.com:edipzahit1/Jira-Assign-AI.git
   cd jira_assign_ai
   ```

2. **Generate the Offline Package:**
   Run the packaging script. This will pull necessary base images, build your custom application images, and export them as `.tar` files.
   - **Windows:** Run `.\package_offline.ps1` in PowerShell.
   - **Linux/Mac:** Run `chmod +x package_offline.sh && ./package_offline.sh`
   
   *This creates `backend_image.tar`, `frontend_image.tar`, and `db_image.tar`.*

---

### **Phase 2: Deployment (Target / Offline Machine)**
Transfer the following files to your air-gapped corporate server via USB or internal file transfer:
- `backend_image.tar`, `frontend_image.tar`, `db_image.tar`
- `docker-compose.offline.yml`
- `.env.example` (Rename this to `.env` on the target machine)

1. **Load the Images:**
   ```bash
   docker load < backend_image.tar
   docker load < frontend_image.tar
   docker load < db_image.tar
   ```

2. **Configure Environment:**
   Edit the `.env` file and fill in your corporate Jira credentials and database settings.

3. **Start the Application:**
   ```bash
   docker compose -f docker-compose.offline.yml up -d
   ```
   The application will be accessible at `http://localhost` (or the port defined in `APP_PORT`).

---

## ⚙️ IT & Operations Notes

### **Port Configuration**
If port 80 is already in use, change the `APP_PORT` in your `.env` file:
```env
APP_PORT=8080
```

### **Security Settings**
- **SECURE_COOKIES:** Set to `true` if deploying behind an SSL/HTTPS proxy.
- **ALLOWED_ORIGINS:** Critical for CORS. Add the full DNS or IP address used by employees to access the tool (e.g., `http://jira-ai.company.local`).

### **Resetting Admin Password**
If you lose access to the Portal Admin account:
```bash
docker exec -it jira-assign-backend python reset_password.py <username> <new_password>
```

---

## 📂 Documentation
For detailed technical specifications, refer to the `docs/` directory:
- [System Architecture](docs/asai_prod.pdf)
- [Database Schema](docs/database.md)
- [Gantt Roadmap (Interactive)](docs/gantt-chart-tr.html)
- [User Manual](docs/user_manual/user_manual.docx)
- [Demo Guide](docs/test_scenario/demo_rehberi.md)
- [Technical Structure Diagram](docs/sys_arch.png)

---
**Developer:** Edip Zahit Güney (@edipzahit1)  
**Date:** May 2024
