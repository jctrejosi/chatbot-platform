"""Smoke test del troceador (sin dependencias externas).

Cubre casos límite que ya provocaron fallos reales: texto vacío, palabra
gigante, bloque sin saltos de línea, solape y el bucle infinito de la
estrategia `fixed` al llegar al final del texto.

Uso: python scripts/chunk_smoke_test.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.chunking import chunk_text, normalize_text  # noqa: E402

failures = []


def check(name, cond, detail=""):
    print(f"{'✅' if cond else '❌'} {name}{(' — ' + detail) if detail else ''}")
    if not cond:
        failures.append(name)


# 1. Vacío / solo espacios
check("vacío → []", chunk_text("") == [] and chunk_text("   \n\n ") == [])

# 2. Texto corto
short = chunk_text("Hola mundo")
check("texto corto → 1 chunk", len(short) == 1 and short[0] == "Hola mundo")

# 3. Palabra gigante (no debe colgarse ni superar el máximo)
big_word = "a" * 2000
parts = chunk_text(big_word, strategy="sections", chunk_size=600, overlap=100)
check("palabra gigante termina", True, f"{len(parts)} chunks")
check("palabra gigante respeta máximo", all(len(c) <= 600 for c in parts), f"max={max(map(len, parts))}")
check("palabra gigante conserva todo", "".join(p.lstrip(".") for p in parts).count("a") >= 2000)

# 4. Bloque enorme sin líneas en blanco
block = " ".join(["palabra"] * 1500)
parts = chunk_text(block, strategy="sections", chunk_size=600, overlap=100)
check("bloque sin saltos se reparte", len(parts) > 1, f"{len(parts)} chunks")
check("bloque respeta máximo", all(len(c) <= 600 for c in parts), f"max={max(map(len, parts))}")

# 5. Solape presente y en límite de palabra
base = "\n\n".join([f"Sección {i}: " + ("contenido de prueba " * 30) for i in range(6)])
parts = chunk_text(base, strategy="sections", chunk_size=600, overlap=100)
non_first = parts[1:]
check("solape aplicado", all(c.startswith("...") for c in non_first), f"{len(non_first)} chunks")
check("solape no parte palabras", all(not c.startswith("... ") for c in non_first))

# 6. Normalización
raw = "infor-\nmación útil\r\n\r\n-- 2 of 4 --\r\nPágina 2 de 4\r\n\r\nfinal"
norm = normalize_text(raw)
check("une guion de corte", "información" in norm)
check("quita marcador -- 2 of 4 --", "-- 2 of 4 --" not in norm)
check("quita 'Página 2 de 4'", "Página 2 de 4" not in norm)

# 7. Estrategia fixed con overlap muy grande (guard anti-bucle)
parts = chunk_text("x" * 5000, strategy="fixed", chunk_size=200, overlap=200)
check("fixed con overlap enorme termina", 0 < len(parts) < 100, f"{len(parts)} chunks")
check("fixed respeta máximo", all(len(c) <= 200 for c in parts))

# 8. Sin pérdida de contenido (salvo solape/espacios)
source = " ".join(f"w{i}" for i in range(300))
parts = chunk_text(source, strategy="sections", chunk_size=600, overlap=100)
joined = " " + " ".join(parts) + " "
words_missing = [f"w{i}" for i in range(300) if f" w{i} " not in joined]
check("sin palabras perdidas", not words_missing, f"faltan={words_missing[:5]}")

# 9. Encabezado no queda huérfano
doc = "INTRO\n\n" + ("texto introductorio " * 25) + "\n\nTÍTULO\n\n" + ("contenido largo " * 60)
parts = chunk_text(doc, strategy="sections", chunk_size=600, overlap=100)
orphans = [p for p in parts if len(p) < 40]
check("sin chunks huérfanos", not orphans, f"{[len(p) for p in orphans]}")

print()
if failures:
    print(f"❌ {len(failures)} fallo(s): {failures}")
    raise SystemExit(1)
print("✅ Todos los checks pasaron")
