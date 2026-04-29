"""
Context-Aware Chunker — Fase 1C

Chunking inteligente que respeita limites semânticos:
- Markdown: chunk por seção (h1/h2/h3)
- Código Python/TS: chunk por função/classe
- Configs: arquivo inteiro como chunk
- Overlap de ~200 tokens entre chunks
"""

import re
import ast
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class Chunk:
    content: str
    metadata: dict
    char_start: int
    char_end: int


OVERLAP_CHARS = 150   # ~37 tokens — contexto mínimo entre chunks
MIN_SECTION_CHARS = 80  # seções menores que isso são mescladas com a próxima


def _make_metadata(
    file_path: str,
    file_type: str,
    language: str,
    semantic_role: str = "",
    chunk_index: int = 0,
    symbol_name: str = "",
) -> dict:
    return {
        "repo": "",
        "file_path": file_path,
        "file_type": file_type,
        "language": language,
        "semantic_role": semantic_role,
        "stack_context": "",
        "symbol_name": symbol_name,
        "chunk_index": chunk_index,
    }


def _infer_role(file_path: str) -> str:
    """Infer semantic role from path for metadata."""
    p = file_path.lower()
    if any(x in p for x in ("main.", "index.", "app.", "server.")):
        return "entrypoint"
    if any(x in p for x in ("route", "router", "controller", "endpoint", "api/")):
        return "routes"
    if any(x in p for x in ("model", "schema", "entity", "type")):
        return "models"
    if "middleware" in p:
        return "middleware"
    if any(x in p for x in ("config", "setting", "env")):
        return "config"
    if any(x in p for x in ("test", "spec", "__test__")):
        return "tests"
    if any(x in p for x in ("readme", "docs/", "doc/", ".md")):
        return "docs"
    if any(x in p for x in ("migration", "alembic")):
        return "migrations"
    return "other"


def chunk_markdown(content: str, file_path: str) -> list[Chunk]:
    """Split por seções h1/h2/h3. Seções pequenas são mescladas com a próxima."""
    role = _infer_role(file_path)

    # Arquivos pequenos (<= 3000 chars): chunk único — evita explosão de tiny chunks em skills
    if len(content) <= 3000:
        return [
            Chunk(
                content=content,
                metadata=_make_metadata(file_path, "markdown", "markdown", role, 0),
                char_start=0,
                char_end=len(content),
            )
        ]

    # Split at any heading h1-h3
    heading_pattern = re.compile(r"^(#{1,3} .+)$", re.MULTILINE)
    splits = list(heading_pattern.finditer(content))

    if not splits:
        return [
            Chunk(
                content=content,
                metadata=_make_metadata(file_path, "markdown", "markdown", role, 0),
                char_start=0,
                char_end=len(content),
            )
        ]

    # Collect raw sections
    raw_sections: list[tuple[int, int, str]] = []  # (start, end, text)
    if splits[0].start() > 0:
        preamble = content[: splits[0].start()].strip()
        if preamble:
            raw_sections.append((0, splits[0].start(), preamble))

    for i, match in enumerate(splits):
        start = match.start()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(content)
        raw_sections.append((start, end, content[start:end].strip()))

    # Merge small sections with the next one
    merged: list[tuple[int, int, str]] = []
    i = 0
    while i < len(raw_sections):
        start, end, text = raw_sections[i]
        # Accumulate small consecutive sections
        while len(text) < MIN_SECTION_CHARS and i + 1 < len(raw_sections):
            i += 1
            next_start, next_end, next_text = raw_sections[i]
            text = text + "\n\n" + next_text
            end = next_end
        merged.append((start, end, text))
        i += 1

    # Build chunks with overlap
    chunks: list[Chunk] = []
    for idx, (start, end, section_text) in enumerate(merged):
        if chunks:
            overlap = chunks[-1].content[-OVERLAP_CHARS:]
            if overlap and not section_text.startswith(overlap):
                section_text = overlap + "\n\n" + section_text

        chunks.append(
            Chunk(
                content=section_text,
                metadata=_make_metadata(file_path, "markdown", "markdown", role, idx),
                char_start=start,
                char_end=end,
            )
        )

    for i, c in enumerate(chunks):
        c.metadata["chunk_index"] = i

    return chunks


def chunk_python(content: str, file_path: str) -> list[Chunk]:
    """Usa ast.parse para identificar funções e classes. Cada função/classe = 1 chunk."""
    role = _infer_role(file_path)
    chunks: list[Chunk] = []
    lines = content.splitlines(keepends=True)

    try:
        tree = ast.parse(content)
    except SyntaxError:
        # Regex fallback
        return _chunk_python_regex(content, file_path, role)

    # Collect top-level and class-level functions/classes
    symbols: list[tuple[str, str, int, int]] = []  # (kind, name, lineno, end_lineno)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            # Only top-level and first-level class methods
            kind = "class" if isinstance(node, ast.ClassDef) else "function"
            lineno = node.lineno
            end_lineno = getattr(node, "end_lineno", lineno)
            symbols.append((kind, node.name, lineno, end_lineno))

    if not symbols:
        # No symbols — single chunk
        return [
            Chunk(
                content=content,
                metadata=_make_metadata(file_path, "python", "python", role, 0),
                char_start=0,
                char_end=len(content),
            )
        ]

    # Sort by line number and deduplicate overlapping ranges (keep outermost)
    symbols.sort(key=lambda x: x[2])
    # Remove nested symbols (keep only top-level by filtering overlaps)
    top_level: list[tuple[str, str, int, int]] = []
    for sym in symbols:
        if top_level and sym[2] <= top_level[-1][3]:
            # nested inside the last — skip (class methods are inside class)
            continue
        top_level.append(sym)

    prev_end_line = 0
    for i, (kind, name, lineno, end_lineno) in enumerate(top_level):
        # Compute char positions from line numbers
        start_char = sum(len(l) for l in lines[: lineno - 1])
        end_char = sum(len(l) for l in lines[:end_lineno])

        chunk_text = content[start_char:end_char].strip()

        # Overlap from previous chunk
        if chunks:
            overlap = chunks[-1].content[-OVERLAP_CHARS:]
            if overlap and not chunk_text.startswith(overlap):
                chunk_text = overlap + "\n\n" + chunk_text

        chunks.append(
            Chunk(
                content=chunk_text,
                metadata=_make_metadata(file_path, "python", "python", role, i, name),
                char_start=start_char,
                char_end=end_char,
            )
        )

    # Update chunk_index
    for i, c in enumerate(chunks):
        c.metadata["chunk_index"] = i

    return chunks if chunks else [
        Chunk(
            content=content,
            metadata=_make_metadata(file_path, "python", "python", role, 0),
            char_start=0,
            char_end=len(content),
        )
    ]


def _chunk_python_regex(content: str, file_path: str, role: str) -> list[Chunk]:
    """Regex fallback for Python chunking."""
    pattern = re.compile(r"^((?:async\s+)?def\s+\w+|class\s+\w+)", re.MULTILINE)
    splits = list(pattern.finditer(content))

    if not splits:
        return [
            Chunk(
                content=content,
                metadata=_make_metadata(file_path, "python", "python", role, 0),
                char_start=0,
                char_end=len(content),
            )
        ]

    chunks: list[Chunk] = []
    for i, match in enumerate(splits):
        start = match.start()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(content)
        text = content[start:end].strip()
        name_match = re.match(r"(?:async\s+)?def\s+(\w+)|class\s+(\w+)", text)
        sym = (name_match.group(1) or name_match.group(2)) if name_match else ""

        if chunks:
            overlap = chunks[-1].content[-OVERLAP_CHARS:]
            if overlap:
                text = overlap + "\n\n" + text

        chunks.append(
            Chunk(
                content=text,
                metadata=_make_metadata(file_path, "python", "python", role, i, sym),
                char_start=start,
                char_end=end,
            )
        )

    for i, c in enumerate(chunks):
        c.metadata["chunk_index"] = i

    return chunks


def chunk_typescript(content: str, file_path: str) -> list[Chunk]:
    """Regex para function/class/export const/export default/interface/type."""
    role = _infer_role(file_path)
    ext = Path(file_path).suffix.lower()
    language = "typescript" if ext in (".ts", ".tsx") else "javascript"
    file_type = language

    pattern = re.compile(
        r"^(?:export\s+)?(?:default\s+)?(?:"
        r"(?:async\s+)?function\s+(\w+)"
        r"|class\s+(\w+)"
        r"|const\s+(\w+)\s*=\s*(?:async\s+)?\("
        r"|const\s+(\w+)\s*=\s*(?:async\s+)?function"
        r"|interface\s+(\w+)"
        r"|type\s+(\w+)\s*="
        r"|enum\s+(\w+)"
        r")",
        re.MULTILINE,
    )

    splits = list(pattern.finditer(content))

    if not splits:
        return [
            Chunk(
                content=content,
                metadata=_make_metadata(file_path, file_type, language, role, 0),
                char_start=0,
                char_end=len(content),
            )
        ]

    chunks: list[Chunk] = []
    # preamble
    if splits[0].start() > 0:
        preamble = content[: splits[0].start()].strip()
        if preamble:
            chunks.append(
                Chunk(
                    content=preamble,
                    metadata=_make_metadata(file_path, file_type, language, role, 0),
                    char_start=0,
                    char_end=splits[0].start(),
                )
            )

    for i, match in enumerate(splits):
        start = match.start()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(content)
        text = content[start:end].strip()

        # Extract symbol name from any capturing group
        sym = next((g for g in match.groups() if g), "")

        if chunks:
            overlap = chunks[-1].content[-OVERLAP_CHARS:]
            if overlap and not text.startswith(overlap):
                text = overlap + "\n\n" + text

        idx = len(chunks)
        chunks.append(
            Chunk(
                content=text,
                metadata=_make_metadata(file_path, file_type, language, role, idx, sym),
                char_start=start,
                char_end=end,
            )
        )

    for i, c in enumerate(chunks):
        c.metadata["chunk_index"] = i

    return chunks


def chunk_config(content: str, file_path: str) -> list[Chunk]:
    """Arquivo inteiro como 1 chunk."""
    role = _infer_role(file_path)
    ext = Path(file_path).suffix.lower()
    name = Path(file_path).name.lower()

    if ext == ".json":
        file_type = "json"
        language = "json"
    elif ext in (".yaml", ".yml"):
        file_type = "yaml"
        language = "yaml"
    elif ext == ".toml":
        file_type = "toml"
        language = "toml"
    elif name.startswith(".env"):
        file_type = "env"
        language = "env"
    else:
        file_type = "config"
        language = "text"

    return [
        Chunk(
            content=content,
            metadata=_make_metadata(file_path, file_type, language, role, 0),
            char_start=0,
            char_end=len(content),
        )
    ]


def chunk_file(content: str, file_path: str, language: str) -> list[Chunk]:
    """Dispatcher baseado na extensão/language."""
    ext = Path(file_path).suffix.lower()
    name = Path(file_path).name.lower()

    if ext in (".md", ".mdx"):
        return chunk_markdown(content, file_path)
    elif ext == ".py":
        return chunk_python(content, file_path)
    elif ext in (".ts", ".tsx", ".js", ".jsx"):
        return chunk_typescript(content, file_path)
    elif ext in (".json", ".yaml", ".yml", ".toml") or name.startswith(".env"):
        return chunk_config(content, file_path)
    else:
        # Fallback: config-style (entire file as one chunk)
        return chunk_config(content, file_path)
