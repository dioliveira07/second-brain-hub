"""
Reflection Engine — Fase 4

Processa PRs mergeados para extrair decisões arquiteturais:
1. Recebe diff + metadata do PR
2. Envia para Claude API com prompt de análise
3. Armazena resumo no PostgreSQL + Qdrant
"""

# TODO: Fase 4 — Implementar:
# - analyze_pr(diff: str, title: str, description: str) -> dict
# - store_decision(repo_id: str, decision: dict) -> None
