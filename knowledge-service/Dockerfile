# ============================================================================
# Knowledge Service — con LibreOffice headless incluido.
#
# Permite extraer texto de "cualquier documento" (.doc, .ppt, .pages, .epub,
# .msg, .mht…) sin instalar nada en el host: LibreOffice va dentro de la imagen
# y convierte a PDF; el pipeline reutiliza PyMuPDF para extraer el texto.
#
# Uso (desde knowledge-service/):
#   docker compose up -d --build
#   docker compose down
# ============================================================================
FROM python:3.12-slim

# LibreOffice headless (paquetes mínimos) + fuentes para una extracción legible.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
