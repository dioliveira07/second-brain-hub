"""memory_writer — converte events em memories (Sonnet, baixo custo).

Inscrito em:
- signal.commit_realizado  → cria progress memory se mensagem é substantiva
- decision.merged          → cria architectural_decision memory permanente

Heurísticas evitam chamar Sonnet para ruído (commits "wip", "fix typo", etc).
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory, CausalEdge


# commits que não viram memória
_NOISE_PATTERNS = [
    re.compile(r"^\s*(wip|tmp|temp|test)\s*$", re.I),
    re.compile(r"^\s*fix\s+typo\b", re.I),
    re.compile(r"^\s*update\s+readme\b", re.I),
    re.compile(r"^\s*format\b", re.I),
    re.compile(r"^\s*lint\b", re.I),
]


def _is_noise(msg: str) -> bool:
    if not msg or len(msg.strip()) < 12:
        return True
    return any(p.search(msg) for p in _NOISE_PATTERNS)


@register
class MemoryWriter(AgentBase):
    NAME = "memory_writer"
    MODEL = "sonnet"
    SUBSCRIBES = (
        "signal.commit_realizado",
        "decision.merged",
    )

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        ev = event or input or {}
        ev_type = ev.get("type", "")
        payload = ev.get("payload", {}) or {}

        if ev_type == "decision.merged":
            return await self._handle_decision(db, ev, payload)
        elif ev_type == "signal.commit_realizado":
            return await self._handle_commit(db, ev, payload)
        else:
            return AgentResult(status="done", output={"skipped": True, "reason": f"event type {ev_type} não suportado"})

    async def _handle_decision(self, db: AsyncSession, ev: dict, payload: dict) -> AgentResult:
        title = payload.get("pr_title") or "PR sem título"
        impact_areas = payload.get("impact_areas", []) or []
        breaking = payload.get("breaking_changes", False)
        decision_id = payload.get("decision_id")

        content = (
            f"PR #{payload.get('pr_number', '?')}: {title}\n"
            f"Autor: {ev.get('actor', '?')}\n"
            f"Áreas afetadas: {', '.join(impact_areas)}\n"
            f"Breaking change: {'sim' if breaking else 'não'}\n"
            f"Arquivos: {', '.join((payload.get('changed_files') or [])[:10])}"
        )

        mem = Memory(
            type="architectural_decision",
            scope="project",
            scope_ref=ev.get("projeto"),
            title=title[:500],
            content=content,
            tags=impact_areas + (["breaking"] if breaking else []),
            confidence=1.0,
            source_type="decision",
            source_ref=decision_id,
            expires_at=None,  # permanente
        )
        db.add(mem)
        await db.flush()

        # liga memory ↔ decision
        if decision_id:
            try:
                edge = CausalEdge(
                    cause_table="architectural_decisions",
                    cause_id=uuid.UUID(decision_id),
                    effect_table="memories",
                    effect_id=mem.id,
                    relation="derived_from",
                    confidence=1.0,
                    detected_by="memory_writer",
                )
                db.add(edge)
            except Exception:
                pass  # edge é opcional

        return AgentResult(output={"memory_id": str(mem.id), "type": "architectural_decision"})

    async def _handle_commit(self, db: AsyncSession, ev: dict, payload: dict) -> AgentResult:
        msg = payload.get("msg") or payload.get("message") or ""
        if _is_noise(msg):
            return AgentResult(status="done", output={"skipped": True, "reason": "commit msg é ruído"})

        sha = payload.get("sha", "?")
        branch = payload.get("branch", "?")
        files_changed = payload.get("files_changed", 0)

        # Para commits, usa Sonnet para extrair "o que foi feito" se mensagem for >50 chars
        # Para mensagens curtas, gera memória direta sem chamar LLM
        if len(msg) > 80:
            prompt = (
                f"Resuma este commit em 1 frase clara descrevendo a mudança e seu propósito. "
                f"Máximo 200 caracteres.\n\n"
                f"Commit: {msg}\n"
                f"Arquivos modificados: {files_changed}\n"
                f"Branch: {branch}\n\n"
                f"Resposta apenas com o resumo, sem prefácio."
            )
            try:
                summary = (await self._claude_call(prompt, max_tokens=128, timeout=60)).strip()[:300]
                cost = self._estimate_cost(len(prompt), len(summary))
            except Exception:
                summary = msg[:300]
                cost = 0.0
        else:
            summary = msg
            cost = 0.0

        mem = Memory(
            type="progress",
            scope="project",
            scope_ref=ev.get("projeto"),
            title=summary[:500],
            content=f"Commit {sha} por {ev.get('actor', '?')} em {branch}\n\n{msg}",
            tags=[branch] if branch else [],
            confidence=0.7,  # progress começa com confiança média; decay aplicado depois
            source_type="signal",
            source_ref=str(ev.get("source_id", "")),
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(mem)
        await db.flush()

        return AgentResult(
            output={"memory_id": str(mem.id), "type": "progress", "summary_length": len(summary)},
            cost_estimate=cost,
        )
