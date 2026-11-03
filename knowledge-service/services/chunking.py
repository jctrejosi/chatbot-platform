"""Text chunking strategies.

Pipeline (misma filosofía que whatsapp-bot-platform):

1. `normalize_text()` limpia artefactos de la extracción (form feeds, marcadores
   de página, palabras cortadas por guion y espacios repetidos).
2. Las secciones se empaquetan hasta `chunk_size`; una sección mayor se reparte
   por oraciones y, si hace falta, por palabras (antes quedaba un chunk
   gigantesco sin re-partir).
3. Los chunks finales demasiado pequeños se fusionan con el anterior.
4. El solape se aplica en límite de palabra, sin cortar palabras.

El tamaño objetivo (600 chars por defecto) se mantiene por debajo del límite de
tokens de los modelos de embeddings habituales y deja margen al solape.
"""

import re

DEFAULT_CHUNK_SIZE = 600
DEFAULT_OVERLAP = 100

# -- 1 of 5 -- / -- 3 de 10 --
_PAGE_MARKER_RE = re.compile(
    r"-{2,}[ \t]*\d+[ \t]+(?:of|de)[ \t]+\d+[ \t]*-{2,}", re.IGNORECASE
)

# Página 1 de 5 / Page 1 of 5 / Página 1/5 (línea completa)
_PAGE_LINE_RE = re.compile(
    r"^[ \t]*(?:p[áa]gina|page)[ \t]+\d+[ \t]*(?:de|of|/)[ \t]*\d+[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)


def normalize_text(text: str) -> str:
    """Limpia el texto extraído (sobre todo de PDF) antes de trocearlo."""
    text = str(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\f", "\n")  # saltos de página
    text = _PAGE_MARKER_RE.sub(" ", text)
    text = _PAGE_LINE_RE.sub("", text)
    text = re.sub(r"(\w+)-\n(\w+)", r"\1\2", text)  # palabras cortadas por guion
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_heading(section: str) -> bool:
    """Encabezado típico: línea corta, en mayúsculas o terminada en ':'."""
    return len(section) < 120 and (section.isupper() or section.rstrip().endswith(":"))


def _tail_at_word_boundary(text: str, max_chars: int) -> str:
    """Últimos `max_chars` caracteres, descartando la primera palabra a medias."""
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    tail = text[-max_chars:]
    first_space = re.search(r"\s", tail)
    if first_space:
        return tail[first_space.start() + 1 :]
    return tail


def _split_by_words(text: str, max_len: int) -> list[str]:
    """Reparte un texto por palabras sin pasar de `max_len`."""
    out: list[str] = []
    buf = ""
    for word in text.split():
        if len(word) > max_len:
            if buf:
                out.append(buf)
                buf = ""
            out.extend(word[i : i + max_len] for i in range(0, len(word), max_len))
            continue
        cand = f"{buf} {word}" if buf else word
        if len(cand) <= max_len:
            buf = cand
        else:
            if buf:
                out.append(buf)
            buf = word
    if buf:
        out.append(buf)
    return out


def _split_long_piece(piece: str, max_len: int) -> list[str]:
    """Reparte un texto largo por oraciones (y luego por palabras si aún no cabe)."""
    out: list[str] = []
    buf = ""

    def flush() -> None:
        nonlocal buf
        if buf:
            out.append(buf)
            buf = ""

    for sentence in re.split(r"(?<=[.!?])\s+", piece):
        if len(sentence) > max_len:
            flush()
            out.extend(_split_by_words(sentence, max_len))
            continue
        cand = f"{buf} {sentence}" if buf else sentence
        if len(cand) <= max_len:
            buf = cand
        else:
            flush()
            buf = sentence
    flush()
    return out


def _attach_headings(
    pieces: list[str], max_chars: int
) -> list[tuple[str, bool]]:
    """Une cada encabezado con el inicio de su contenido.

    Devuelve `(texto, abre_seccion)`. Evita que un encabezado quede solo en un
    chunk diminuto cuando el párrafo siguiente no cabe entero a su lado.
    """
    out: list[tuple[str, bool]] = []
    i = 0
    while i < len(pieces):
        piece = pieces[i]
        if (
            _is_heading(piece)
            and i + 1 < len(pieces)
            and not _is_heading(pieces[i + 1])
        ):
            nxt = pieces[i + 1]
            room = max_chars - len(piece) - 2
            if room > 0:
                if len(nxt) <= room:
                    out.append((f"{piece}\n\n{nxt}", True))
                    i += 2
                    continue
                parts = _split_long_piece(nxt, room)
                if parts:
                    out.append((f"{piece}\n\n{parts[0]}", True))
                    out.extend((p, False) for p in parts[1:])
                    i += 2
                    continue
        out.append((piece, _is_heading(piece)))
        i += 1
    return out


def _merge_tiny(raw: list[str], min_chars: int, max_merge: int) -> list[str]:
    """Fusiona chunks diminutos con un vecino, sin superar `max_merge`."""
    i = 0
    while i < len(raw):
        if len(raw) == 1:
            break
        if len(raw[i]) >= min_chars:
            i += 1
            continue
        if i > 0 and len(raw[i - 1]) + len(raw[i]) + 2 <= max_merge:
            raw[i - 1] = f"{raw[i - 1]}\n\n{raw[i]}"
            raw.pop(i)
            i = max(0, i - 1)
            continue
        if i + 1 < len(raw) and len(raw[i]) + len(raw[i + 1]) + 2 <= max_merge:
            raw[i] = f"{raw[i]}\n\n{raw[i + 1]}"
            raw.pop(i + 1)
            continue
        i += 1
    return raw


def chunk_by_sections(
    text: str,
    max_chars: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Trocea por secciones semánticas respetando encabezados y tamaño máximo.

    - Las secciones se detectan por doble salto de línea (párrafos).
    - Una sección mayor que el presupuesto se reparte por oraciones/palabras.
    - Cada encabezado se une al inicio de su contenido y abre chunk nuevo.
    - Los chunks diminutos se fusionan con un vecino.
    - `overlap` añade la cola del chunk anterior (en límite de palabra).

    `chunk_size` es el **máximo final** del chunk: se reserva el espacio del
    solape para que el resultado nunca lo supere.
    """
    clean = normalize_text(text)
    if not clean:
        return []

    max_chars = max(1, max_chars)
    # El solape nunca debe acercarse al tamaño del chunk (evita miles de chunks).
    overlap = max(0, min(overlap, max_chars // 2))
    # Presupuesto del contenido: reserva sitio al solape y al prefijo "... ".
    budget = max(1, max_chars - overlap - (4 if overlap > 0 else 0))

    # 1) Secciones → piezas que nunca superan el presupuesto
    pieces: list[str] = []
    for section in re.split(r"\n{2,}", clean):
        section = section.strip()
        if not section:
            continue
        if len(section) <= budget:
            pieces.append(section)
        else:
            pieces.extend(_split_long_piece(section, budget))

    if not pieces:
        return []

    # 2) Encabezado + inicio de su contenido
    marked = _attach_headings(pieces, budget)

    # 3) Empaquetado greedy; un encabezado abre chunk nuevo
    raw: list[str] = []
    buf = ""
    for piece, opens_section in marked:
        if opens_section and buf:
            raw.append(buf)
            buf = piece
            continue

        cand = f"{buf}\n\n{piece}" if buf else piece
        if len(cand) <= budget:
            buf = cand
        else:
            if buf:
                raw.append(buf)
            if len(piece) > budget:
                raw.extend(_split_long_piece(piece, budget))
                buf = ""
            else:
                buf = piece
    if buf:
        raw.append(buf)

    # 4) Fusiona chunks diminutos con un vecino
    min_chars = max(1, round(budget * 0.45))
    raw = _merge_tiny(raw, min_chars, budget)

    # 5) Solape en límite de palabra (ya cabe dentro de max_chars)
    chunks: list[str] = []
    for i, current in enumerate(raw):
        if i > 0 and overlap > 0:
            snippet = _tail_at_word_boundary(raw[i - 1], overlap).strip()
            if snippet:
                current = f"...{snippet} {current}"
        current = current.strip()
        if current:
            chunks.append(current)

    return chunks


def chunk_by_fixed_size(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Divide el texto en chunks de tamaño fijo con solape."""
    clean = normalize_text(text)
    if not clean:
        return []

    chunk_size = max(1, chunk_size)
    # Mantiene progreso garantizado: el avance por iteración es >= chunk_size/2.
    overlap = max(0, min(overlap, chunk_size // 2))

    chunks: list[str] = []
    start = 0

    while start < len(clean):
        end = min(start + chunk_size, len(clean))

        # Intenta cortar en un límite natural (párrafo, línea, oración, espacio)
        if end < len(clean):
            for sep in ("\n\n", "\n", ". ", " "):
                pos = clean.rfind(sep, start, end)
                if pos > start + chunk_size // 2:
                    end = pos + len(sep)
                    break

        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Fin del texto: no reintentar (con solape, end-overlap volvería a entrar).
        if end >= len(clean):
            break
        # Garantiza avance estricto aunque el solape sea grande.
        start = max(end - overlap, start + 1)

    return chunks


def chunk_text(
    text: str,
    strategy: str = "sections",
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Divide el texto en chunks usando la estrategia indicada.

    Args:
        text: Texto completo del documento.
        strategy: 'sections' (semántico) o 'fixed' (tamaño fijo).
        chunk_size: Máximo de caracteres por chunk.
        overlap: Solape en caracteres con el chunk anterior (ambas estrategias).
    """
    if strategy == "fixed":
        return chunk_by_fixed_size(text, chunk_size, overlap)
    return chunk_by_sections(text, max_chars=chunk_size, overlap=overlap)
