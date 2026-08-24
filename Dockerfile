# ============================================================================
# Servidor ÚNICO para Render: backend (Node/Express) + knowledge-service
# (FastAPI/uvicorn) + LibreOffice headless, en el mismo contenedor.
#
# El backend escucha en $PORT (lo inyecta Render) y llama al knowledge-service
# internamente en http://localhost:8000 (KNOWLEDGE_SERVICE_URL).
# ============================================================================
FROM node:22-bookworm-slim

# Python 3 + LibreOffice headless (extracción de "cualquier documento")
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Backend (Node) — primero las dependencias para aprovechar cache de capas
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm install --omit=dev

# 2) Knowledge service (Python) — venv propio
COPY knowledge-service/requirements.txt ./knowledge-service/
RUN python3 -m venv /app/knowledge-service/.venv \
    && /app/knowledge-service/.venv/bin/pip install --no-cache-dir -r /app/knowledge-service/requirements.txt

# 3) Código
COPY backend ./backend
COPY knowledge-service ./knowledge-service
COPY deploy ./deploy

# El backend habla con el knowledge-service dentro del mismo contenedor.
ENV KNOWLEDGE_SERVICE_URL=http://localhost:8000

EXPOSE 3000

CMD ["bash", "/app/deploy/start.sh"]
