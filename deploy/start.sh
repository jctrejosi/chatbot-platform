#!/usr/bin/env bash
# Arranca knowledge-service (:8000, interno) y backend ($PORT) en el mismo
# contenedor. El backend queda en primer plano (proceso principal); el
# knowledge-service corre en background y se detiene junto con el contenedor.
set -euo pipefail

echo "[start] knowledge-service → :8000"
(
  cd /app/knowledge-service
  exec /app/knowledge-service/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
) &
KS_PID=$!

# Espera breve: el backend tiene circuit-breaker/retries, pero arrancar con el
# knowledge-service listo evita errores en las primeras peticiones.
for i in $(seq 1 45); do
  if (exec 3<>/dev/tcp/127.0.0.1/8000) 2>/dev/null; then
    exec 3>&- 3<&- 2>/dev/null || true
    echo "[start] knowledge-service listo (intento $i)"
    break
  fi
  sleep 1
done

echo "[start] backend → :${PORT:-3000}"
cd /app/backend
exec node src/index.js
