"""Validación de la ingesta transaccional (sin DB real).

Simula la conexión de asyncpg para comprobar:
  - documento + chunks se escriben en una transacción,
  - `is_embedded` se marca solo cuando hay vectores,
  - un fallo de embeddings no deja filas a medias,
  - un fallo de INSERT hace rollback de documento y chunks.

Uso: python scripts/ingestion_smoke_test.py
"""

import asyncio
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _stub(name, **attrs):
    try:
        return __import__(name)
    except ImportError:
        mod = types.ModuleType(name)
        for key, value in attrs.items():
            setattr(mod, key, value)
        sys.modules[name] = mod
        return mod


_stub("asyncpg", Connection=object, Pool=object)
_stub("httpx", AsyncClient=object)
_stub("dotenv", load_dotenv=lambda *a, **k: None)

from services import ingestion as ing  # noqa: E402


class FakeTransaction:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        self.conn.tx_start = len(self.conn.calls)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if exc_type is not None:  # simula ROLLBACK
            del self.conn.calls[self.conn.tx_start :]
        return False


class FakeConn:
    def __init__(self, job, source, fail_query=None):
        self.job = job
        self.source = source
        self.fail_query = fail_query
        self.calls = []
        self._fetches = 0
        self.tx_start = 0

    async def fetchrow(self, query, *args):
        self._fetches += 1
        return self.job if self._fetches == 1 else self.source

    async def execute(self, query, *args):
        self.calls.append((query, args))
        if self.fail_query and self.fail_query in query:
            raise RuntimeError("fallo simulado")
        return "OK"

    def transaction(self):
        return FakeTransaction(self)


class FakeAcquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *args):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return FakeAcquire(self.conn)


JOB = {"source_id": "src-1"}
SOURCE = {
    "source_type": "manual",
    "raw_text": "texto de prueba",
    "title": "Doc",
    "file_path": None,
    "original_filename": None,
}

failures = []


def check(name, cond):
    print(f"{'✅' if cond else '❌'} {name}")
    if not cond:
        failures.append(name)


def run(embeddings, vectors=None, fail_embed=False, fail_query=None):
    conn = FakeConn(JOB, SOURCE, fail_query=fail_query)

    async def fake_get_pool():
        return FakePool(conn)

    async def fake_embed(_texts):
        if fail_embed:
            raise RuntimeError("fallo de embeddings")
        return vectors

    ing.get_pool = fake_get_pool
    ing.chunk_text = lambda text, strategy="sections": ["chunk A", "chunk B"]
    ing.embedding_enabled = lambda: embeddings
    ing.embed_texts = fake_embed
    ing.embedding_model_name = lambda: "test-model-512"

    error = None
    try:
        asyncio.run(ing.run_ingestion("job-1"))
    except Exception as exc:  # noqa: BLE001
        error = exc
    return conn, error


def queries(conn):
    return [q for q, _ in conn.calls]


# A) Sin embeddings: escribe doc + chunks, no embeddings, no is_embedded
conn, err = run(embeddings=False)
qs = queries(conn)
check("sin embeddings: sin error", err is None)
check("sin embeddings: inserta documento", any("INSERT INTO knowledge_documents" in q for q in qs))
check("sin embeddings: inserta 2 chunks", sum("INSERT INTO knowledge_chunks" in q for q in qs) == 2)
check("sin embeddings: no inserta embeddings", not any("INSERT INTO knowledge_embeddings" in q for q in qs))
check("sin embeddings: no marca is_embedded", not any("is_embedded = TRUE" in q for q in qs))
check("sin embeddings: completa job", any("status = 'completed'" in q for q in qs))

# B) Con embeddings: inserta vectores y marca is_embedded
vectors = [[0.1] * 512, [0.2] * 512]
conn, err = run(embeddings=True, vectors=vectors)
qs = queries(conn)
emb_calls = [(q, a) for q, a in conn.calls if "INSERT INTO knowledge_embeddings" in q]
check("con embeddings: sin error", err is None)
check("con embeddings: inserta 2 vectores", len(emb_calls) == 2)
check("con embeddings: model_name correcto", all(a[2] == "test-model-512" and a[3] == 512 for _, a in emb_calls))
check("con embeddings: marca is_embedded", any("is_embedded = TRUE" in q for q in qs))

# C) Falla la generación de embeddings: no debe escribir documento/chunks
conn, err = run(embeddings=True, fail_embed=True)
qs = queries(conn)
check("fallo embedding: propaga error", err is not None)
check("fallo embedding: no inserta documento", not any("INSERT INTO knowledge_documents" in q for q in qs))
check("fallo embedding: no inserta chunks", not any("INSERT INTO knowledge_chunks" in q for q in qs))
check("fallo embedding: marca failed", any("status = 'failed'" in q for q in qs))

# D) Falla un INSERT dentro de la transacción: rollback de doc + chunks
conn, err = run(embeddings=False, fail_query="INSERT INTO knowledge_chunks")
qs = queries(conn)
check("fallo insert: propaga error", err is not None)
check("fallo insert: rollback sin documento", not any("INSERT INTO knowledge_documents" in q for q in qs))
check("fallo insert: rollback sin chunks", not any("INSERT INTO knowledge_chunks" in q for q in qs))
check("fallo insert: marca failed", any("status = 'failed'" in q for q in qs))

print()
if failures:
    print(f"❌ {len(failures)} fallo(s): {failures}")
    raise SystemExit(1)
print("✅ Todos los checks pasaron")
