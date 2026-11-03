#!/usr/bin/env python3
"""Preview del troceado: compara la implementación anterior con la nueva.

No toca la base de datos ni genera embeddings. Sirve para auditar cómo queda
el documento antes de reindexarlo.

Uso:
    python scripts/chunk_preview.py <archivo.pdf|docx|txt> [chunk_size] [overlap]
    python scripts/chunk_preview.py --demo
    python scripts/chunk_preview.py archivo.pdf --samples 3

Métricas:
    chunks      número de fragmentos
    min/mediana/p95/max   tamaño en caracteres
    >objetivo   chunks que superan chunk_size (indican secciones sin re-partir)
    solape%     % de pares consecutivos con solape real
    cortes      pares sin solape que empiezan/terminan en carácter alfanumérico
                (proxy de corte a mitad de palabra)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.chunking import (  # noqa: E402
    DEFAULT_CHUNK_SIZE,
    DEFAULT_OVERLAP,
    chunk_text,
    normalize_text,
)


# ─── Implementación anterior (línea base para comparar) ─────────────────────

def legacy_chunk_by_sections(text: str, max_chars: int = 800) -> list[str]:
    """Copia del algoritmo previo: NO re-parte secciones largas ni solapa."""
    raw_sections = re.split(r"\n{2,}", text)
    sections = [s.strip() for s in raw_sections if s.strip()]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for section in sections:
        is_heading = len(section) < 120 and (
            section.isupper() or section.rstrip().endswith(":")
        )

        if is_heading or current_len + len(section) > max_chars:
            if current:
                chunks.append("\n\n".join(current))
            current = [section]
            current_len = len(section)
        else:
            current.append(section)
            current_len += len(section)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


# ─── Extracción ─────────────────────────────────────────────────────────────

def extract_text(path: Path) -> str:
    data = path.read_bytes()
    try:
        from services.extraction import extract_file_bytes

        return extract_file_bytes(data, path.name).full_text
    except Exception as exc:  # faltan dependencias o formato no soportado
        print(f"⚠️  Extracción específica no disponible ({exc}). Leyendo como texto plano.")
        return data.decode("utf-8", errors="replace")


def demo_text() -> str:
    """Documento sintético con los casos que el chunker debe manejar."""
    intro = (
        "GUÍA DE SERVICIOS\n\n"
        + ("Este es un párrafo normal sobre los servicios disponibles. " * 8).strip()
    )
    precios = (
        "-- 2 of 4 --\n\nPRECIOS\n\n"
        + (
            "El precio del plan básico es de 100 dólares y el del plan premium "
            "es de 250 dólares. "
        )
        * 10
    ).strip()
    # Sección larga SIN líneas en blanco: la versión anterior la deja entera.
    larga = (
        "SECCIÓN LARGA\n\n"
        + (
            "La información se entrega de forma infor-\nmación detallada y continua. "
        )
        * 60
    ).strip()
    return "\n\n".join([intro, precios, larga])


# ─── Métricas ───────────────────────────────────────────────────────────────

def _percentile(sorted_values: list[int], p: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)


def _shared_suffix_prefix(prev: str, body: str, cap: int = 400) -> int:
    """Longitud del mayor sufijo de `prev` que es prefijo de `body`."""
    max_k = min(len(prev), len(body), cap)
    for k in range(max_k, 0, -1):
        if prev.endswith(body[:k]):
            return k
    return 0


def stats(chunks: list[str], target: int, overlap: int) -> dict:
    lengths = sorted(len(c) for c in chunks)
    pairs = 0
    overlapped = 0
    midword = 0

    for prev, cur in zip(chunks, chunks[1:]):
        pairs += 1
        body = cur[3:] if cur.startswith("...") else cur
        shared = _shared_suffix_prefix(prev, body, cap=max(overlap, 1))
        if shared > 0:
            overlapped += 1
        elif prev and body and prev[-1].isalnum() and body[0].isalnum():
            midword += 1

    return {
        "count": len(chunks),
        "min": lengths[0] if lengths else 0,
        "median": int(_percentile(lengths, 0.50)),
        "p95": int(_percentile(lengths, 0.95)),
        "max": lengths[-1] if lengths else 0,
        "over_target": sum(1 for c in chunks if len(c) > target),
        "overlap_pct": (100.0 * overlapped / pairs) if pairs else 0.0,
        "midword": midword,
    }


def _row(label: str, s: dict) -> str:
    return (
        f"{label:<12} {s['count']:>6} {s['min']:>5} {s['median']:>8} "
        f"{s['p95']:>5} {s['max']:>5} {s['over_target']:>10} "
        f"{s['overlap_pct']:>7.0f}% {s['midword']:>6}"
    )


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Compara el troceado anterior vs el nuevo.")
    parser.add_argument("file", nargs="?", help="PDF/DOCX/TXT a trocear (omite con --demo)")
    parser.add_argument("chunk_size", nargs="?", type=int, default=DEFAULT_CHUNK_SIZE)
    parser.add_argument("overlap", nargs="?", type=int, default=DEFAULT_OVERLAP)
    parser.add_argument("--demo", action="store_true", help="usa un documento sintético")
    parser.add_argument("--samples", type=int, default=0, help="muestra N chunks del resultado nuevo")
    args = parser.parse_args()

    if args.demo or not args.file:
        raw = demo_text()
        source = "demo sintético"
    else:
        path = Path(args.file)
        if not path.exists():
            print(f"❌ No existe el archivo: {path}")
            return 1
        raw = extract_text(path)
        source = str(path)

    if not raw.strip():
        print("❌ El archivo no contiene texto extraíble.")
        return 1

    clean = normalize_text(raw)

    legacy = legacy_chunk_by_sections(raw, max_chars=args.chunk_size)
    new = chunk_text(raw, strategy="sections", chunk_size=args.chunk_size, overlap=args.overlap)

    print(f"\nDocumento: {source}")
    print(f"Caracteres: {len(raw):,} crudos → {len(clean):,} normalizados")
    print(f"Parámetros: chunk_size={args.chunk_size}  overlap={args.overlap}\n")

    print(
        f"{'escenario':<12} {'chunks':>6} {'min':>5} {'mediana':>8} "
        f"{'p95':>5} {'max':>5} {'>objetivo':>10} {'solape%':>8} {'cortes':>6}"
    )
    print("-" * 74)
    print(_row("anterior", stats(legacy, args.chunk_size, args.overlap)))
    print(_row("nuevo", stats(new, args.chunk_size, args.overlap)))
    print()

    if legacy:
        biggest = max(legacy, key=len)
        print(
            f"Chunk más grande (anterior): {len(biggest):,} chars  "
            f"→ {'SÍ' if len(biggest) > args.chunk_size else 'no'} supera el objetivo"
        )
    if new:
        biggest = max(new, key=len)
        print(
            f"Chunk más grande (nuevo):    {len(biggest):,} chars  "
            f"→ {'SÍ' if len(biggest) > args.chunk_size else 'no'} supera el objetivo"
        )

    if args.samples > 0:
        print(f"\nPrimeros {args.samples} chunks nuevos:")
        for i, chunk in enumerate(new[: args.samples], 1):
            preview = chunk.replace("\n", " ")[:160]
            print(f"  [{i}] ({len(chunk)} chars) {preview}…")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
