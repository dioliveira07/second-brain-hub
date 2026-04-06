"""
Context-Aware Chunker — Fase 1C

Chunking inteligente que respeita limites semânticos:
- Markdown: chunk por seção (h1/h2/h3)
- Código Python/TS: chunk por função/classe
- Configs: arquivo inteiro como chunk
- Overlap de ~200 tokens entre chunks
"""

from dataclasses import dataclass


@dataclass
class Chunk:
    content: str
    metadata: dict
    char_start: int
    char_end: int


# TODO: Fase 1C — Implementar:
# - chunk_markdown(content: str, file_path: str) -> list[Chunk]
# - chunk_python(content: str, file_path: str) -> list[Chunk]
# - chunk_typescript(content: str, file_path: str) -> list[Chunk]
# - chunk_config(content: str, file_path: str) -> list[Chunk]
# - chunk_file(content: str, file_path: str, language: str) -> list[Chunk]
