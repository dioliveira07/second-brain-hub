"""AgentBase — abstração para workers Sonnet/Opus.

Herde, defina MODEL e SUBSCRIBES, implemente run().

Exemplo:
    class MyAgent(AgentBase):
        NAME = "my_agent"
        MODEL = "sonnet"
        SUBSCRIBES = ("signal.commit_realizado",)

        async def run(self, *, db, event=None, input=None):
            # event é dict (do event_bus) quando trigger=event
            # input é dict (do payload do POST) quando trigger=manual
            ...
            return AgentResult(output={"created_memory_id": str(mem.id)})
"""
from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, ClassVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentRun
from app.services import event_bus

logger = logging.getLogger("hub.agents")

CLAUDE_BIN = "/usr/local/bin/claude"

# Cost por 1M tokens (aproximado, atualizar quando preços mudarem)
COST_PER_M = {
    "sonnet": {"input": 3.0, "output": 15.0},
    "opus":   {"input": 15.0, "output": 75.0},
    "haiku":  {"input": 0.8, "output": 4.0},
}

# Mapping logical name → model identifier para CLI
MODEL_MAP = {
    "sonnet": "claude-sonnet-4-6",
    "opus":   "claude-opus-4-7",
    "haiku":  "claude-haiku-4-5-20251001",
}


@dataclass
class AgentResult:
    """Retorno de run(). status default 'done', error muda para 'error'."""
    output: dict = field(default_factory=dict)
    status: str = "done"
    error_message: str | None = None
    cost_estimate: float | None = None


class AgentBase:
    """Base abstrata. Subclasses definem NAME, MODEL, SUBSCRIBES."""

    NAME: ClassVar[str] = ""               # identificador único
    MODEL: ClassVar[str] = "sonnet"         # sonnet | opus | haiku
    SUBSCRIBES: ClassVar[tuple[str, ...]] = ()  # event types que ativam o agente
    CRON: ClassVar[str | None] = None       # ex: "0 3 * * *" — None = sem cron

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        raise NotImplementedError

    # ── helpers ─────────────────────────────────────────────────────────────

    async def _claude_call(self, prompt: str, *, max_tokens: int = 1024, timeout: int = 120) -> str:
        """Invoca o binário claude local. Bloqueante — usa to_thread.

        Retorna stdout (texto da resposta). Levanta em erro.
        """
        model_id = MODEL_MAP.get(self.MODEL, MODEL_MAP["sonnet"])

        def _invoke() -> str:
            r = subprocess.run(
                [CLAUDE_BIN, "-p", prompt, "--model", model_id],
                capture_output=True, text=True, timeout=timeout,
            )
            if r.returncode != 0:
                raise RuntimeError(f"claude CLI falhou (rc={r.returncode}): {r.stderr[:500]}")
            return r.stdout

        return await asyncio.to_thread(_invoke)

    def _estimate_cost(self, prompt_chars: int, output_chars: int) -> float:
        """Estimativa grosseira de custo USD. ~4 chars por token."""
        cost = COST_PER_M.get(self.MODEL, COST_PER_M["sonnet"])
        in_tokens = prompt_chars / 4
        out_tokens = output_chars / 4
        return (in_tokens / 1e6) * cost["input"] + (out_tokens / 1e6) * cost["output"]


# ── Execução com log automático ─────────────────────────────────────────────

async def execute_agent(
    agent: AgentBase,
    db: AsyncSession,
    *,
    trigger_type: str,
    trigger_ref: str | None = None,
    event: dict | None = None,
    input: dict | None = None,
) -> AgentRun:
    """Roda um agente, gerando AgentRun log + Event automaticamente."""
    run = AgentRun(
        agent_name=agent.NAME,
        model=agent.MODEL,
        trigger_type=trigger_type,
        trigger_ref=trigger_ref,
        status="running",
        input=input or (event or {}),
        output={},
    )
    db.add(run)
    await db.flush()

    started = time.monotonic()
    try:
        result = await agent.run(db=db, event=event, input=input)
        run.status = result.status
        run.output = result.output or {}
        run.error_message = result.error_message
        run.cost_estimate = result.cost_estimate
    except Exception as e:
        logger.exception("agent %s falhou", agent.NAME)
        run.status = "error"
        run.error_message = str(e)[:1000]
    finally:
        run.duration_ms = int((time.monotonic() - started) * 1000)
        run.completed_at = datetime.now(timezone.utc)

    # publica evento de conclusão
    await event_bus.publish_event(
        db,
        type=f"agent.{run.status}",
        actor=agent.NAME,
        projeto=(event or {}).get("projeto") if event else None,
        payload={
            "agent_run_id": str(run.id),
            "agent_name": agent.NAME,
            "model": agent.MODEL,
            "trigger_type": trigger_type,
            "duration_ms": run.duration_ms,
            "cost_estimate": run.cost_estimate,
        },
        source_table="agent_runs",
        source_id=run.id,
    )
    await db.commit()
    return run
