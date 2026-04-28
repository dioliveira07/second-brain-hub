"""daily_digest — sintetiza o dia de cada dev/projeto em uma memória de contexto.

SONNET — pega events do dia (commits, edits, skills, erros) e gera resumo
narrativo em 1 parágrafo por (dev, projeto). Útil para handoffs, retros,
catch-up de dev que voltou de férias.

Cron: 19h diário (final do expediente típico).

Pipeline:
1. Busca events do dia (00:00–18:59) agrupados por (dev, projeto)
2. Para cada par com atividade significativa (>5 events), monta sumário:
   - X commits ("feat: ...", "fix: ...")
   - Y arquivos editados (top-5 mais tocados)
   - Z erros bash (commands)
   - skills usadas
3. Pede ao Sonnet pra escrever 1 parágrafo narrativo
4. Cria Memory(type=context, scope=dev, scope_ref=dev_name, expires=14d)
"""
from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory, DevSignal


MIN_EVENTS_FOR_DIGEST = 5


@register
class DailyDigest(AgentBase):
    NAME = "daily_digest"
    MODEL = "sonnet"
    SUBSCRIBES = ()
    CRON = "0 19 * * *"  # 19h diário (final do dia)

    async def run(self, *, db: AsyncSession, event=None, input=None) -> AgentResult:
        # Janela: hoje 00:00 → agora
        now = datetime.now(timezone.utc)
        start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)

        r = await db.execute(
            select(DevSignal).where(
                DevSignal.ts >= start,
                DevSignal.ts <= now,
            ).order_by(DevSignal.ts.asc())
        )
        signals = r.scalars().all()
        if not signals:
            return AgentResult(output={"skipped": True, "reason": "sem signals hoje"})

        # Agrupa por (dev, projeto)
        groups: dict[tuple[str, str], list[DevSignal]] = {}
        for s in signals:
            groups.setdefault((s.dev, s.projeto), []).append(s)

        created = 0
        total_cost = 0.0
        for (dev, projeto), evs in groups.items():
            if len(evs) < MIN_EVENTS_FOR_DIGEST:
                continue

            stats = self._summarize_stats(evs)
            prompt = self._build_prompt(dev, projeto, stats, now.date().isoformat())
            try:
                text, usage = await self._claude_call(
                    prompt, max_tokens=400, timeout=60,
                    system_prompt=(
                        "Você sintetiza o dia de trabalho de um dev em 1 parágrafo "
                        "narrativo, claro, em pt-BR. Foco no que foi entregue e em "
                        "padrões observáveis. Sem prefácio, sem listas — só o parágrafo."
                    ),
                )
                summary = text.strip()
                cost = usage.get("_total_cost_usd") or 0.0
                total_cost += cost
            except Exception:
                summary = self._fallback_summary(stats)
                cost = 0.0

            mem = Memory(
                type="context",
                scope="dev",
                scope_ref=dev,
                title=f"Digest {now.date().isoformat()} — {dev} em {projeto}",
                content=summary[:3000] + "\n\n--- Stats brutas ---\n" + self._format_stats(stats),
                tags=[f"projeto:{projeto}", f"data:{now.date().isoformat()}", "digest"],
                confidence=0.7,
                source_type="derived",
                source_ref=f"digest:{now.date().isoformat()}:{dev}:{projeto}",
                expires_at=now + timedelta(days=14),
            )
            db.add(mem)
            await db.flush()
            try:
                from app.services import memory_qdrant
                await asyncio.to_thread(memory_qdrant.index_memory, mem)
            except Exception:
                pass
            created += 1

        await db.commit()

        return AgentResult(
            output={
                "created": created,
                "groups_evaluated": len(groups),
                "total_signals": len(signals),
                "ts": now.isoformat(),
            },
            cost_estimate=total_cost,
        )

    # ── helpers ─────────────────────────────────────────────────────────────

    def _summarize_stats(self, evs: list[DevSignal]) -> dict:
        commits = []
        files: Counter[str] = Counter()
        errors: Counter[str] = Counter()
        skills: Counter[str] = Counter()
        for s in evs:
            d = s.dados or {}
            if s.tipo == "commit_realizado":
                commits.append(d.get("msg", "")[:100])
            elif s.tipo == "arquivo_editado":
                f = d.get("arquivo")
                if f:
                    files[f] += 1
            elif s.tipo == "erro_bash":
                cmd = (d.get("cmd_decoded") or d.get("cmd") or "")[:60]
                if cmd:
                    errors[cmd] += 1
            elif s.tipo == "skill_usada":
                skill = d.get("skill")
                if skill:
                    skills[skill] += 1
        return {
            "commits": commits[:10],
            "top_files": files.most_common(5),
            "top_errors": errors.most_common(3),
            "skills": skills.most_common(),
            "total_events": len(evs),
        }

    def _format_stats(self, stats: dict) -> str:
        lines = [f"total events: {stats['total_events']}"]
        if stats["commits"]:
            lines.append(f"commits ({len(stats['commits'])}):")
            for c in stats["commits"][:5]:
                lines.append(f"  - {c}")
        if stats["top_files"]:
            lines.append("top arquivos:")
            for f, c in stats["top_files"]:
                lines.append(f"  - {f} ({c}x)")
        if stats["top_errors"]:
            lines.append("erros recorrentes:")
            for e, c in stats["top_errors"]:
                lines.append(f"  - {e[:80]} ({c}x)")
        if stats["skills"]:
            lines.append(f"skills: {', '.join(f'/{s} ({c})' for s, c in stats['skills'])}")
        return "\n".join(lines)

    def _build_prompt(self, dev: str, projeto: str, stats: dict, date: str) -> str:
        return (
            f"Sintetize o dia {date} do dev '{dev}' no projeto '{projeto}' em 1 parágrafo. "
            f"Use os dados:\n\n{self._format_stats(stats)}\n\n"
            f"Foco: o que foi entregue, áreas tocadas, padrões observáveis."
        )

    def _fallback_summary(self, stats: dict) -> str:
        parts = []
        if stats["commits"]:
            parts.append(f"{len(stats['commits'])} commits")
        if stats["top_files"]:
            top = stats["top_files"][0][0]
            parts.append(f"foco em {top.rsplit('/', 1)[-1]}")
        if stats["top_errors"]:
            parts.append(f"{sum(c for _, c in stats['top_errors'])} erros bash")
        return ", ".join(parts) or "atividade leve"
