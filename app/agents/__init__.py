"""Worker agents — split Sonnet (I/O) e Opus (reasoning).

Cada agente herda de AgentBase e implementa run(). Triggers:
- cron      — Celery beat
- event     — dispatcher Celery polla events e roteia
- manual    — POST /api/cerebro/agents/{name}/run

Agent framework gerencia AgentRun log automaticamente.
"""
from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register, get_agent, list_agents

__all__ = ["AgentBase", "AgentResult", "register", "get_agent", "list_agents"]
