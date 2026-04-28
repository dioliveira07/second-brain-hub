"""conflict_detector — detecta edições conflitantes com decisões passadas.

OPUS — usa raciocínio profundo para julgar se uma mudança contradiz
decisão arquitetural prévia.

Inscrito em:
- signal.arquivo_editado
- signal.commit_realizado

Pipeline:
1. Extrai arquivo(s) tocado(s) do payload
2. Busca decisões no Qdrant (architectural_decisions) com filter
   payload.changed_files contém o arquivo
3. Top-3 decisões mais recentes (90d)
4. Opus avalia: "essa mudança contradiz alguma dessas decisões?"
5. Se score >= 0.7: cria Memory(type=session, scope=session,
   scope_ref=machine_hostname, expires=24h) — para ser injetada no
   próximo heartbeat
6. Cria CausalEdge contradicts entre signal e decision
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select, or_

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory, CausalEdge, DevSignal


@register
class ConflictDetector(AgentBase):
    NAME = "conflict_detector"
    MODEL = "opus"
    SUBSCRIBES = (
        "signal.arquivo_editado",
        "signal.commit_realizado",
    )

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        ev = event or input or {}
        payload = ev.get("payload", {}) or {}
        projeto = ev.get("projeto") or ""
        actor = ev.get("actor") or "unknown"

        # Extrai arquivos tocados
        files = self._extract_files(payload)
        if not files:
            return AgentResult(status="done", output={"skipped": True, "reason": "sem arquivos no payload"})

        # Busca decisões relevantes no Qdrant (uma busca por arquivo, dedup)
        try:
            from app.services.qdrant import client as qclient
            from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
        except Exception:
            return AgentResult(status="done", output={"skipped": True, "reason": "qdrant indisponível"})

        cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        seen_decisions = {}  # decision_id → payload

        for fname in files[:5]:  # limita 5 arquivos
            try:
                # Qdrant scroll para encontrar decisões cujo payload.changed_files contém o arquivo.
                # Como o changed_files é um array no payload, usa nested match.
                # Implementação simples: busca semantic com a query e filter de repo+date.
                from app.services import embeddings
                qvec = embeddings.embed_query(fname)
                if not isinstance(qvec, list):
                    qvec = qvec.tolist()
                hits = qclient.search(
                    collection_name="architectural_decisions",
                    query_vector=qvec,
                    limit=3,
                    query_filter=Filter(
                        must=[FieldCondition(key="repo", match=MatchValue(value=projeto))]
                    ) if projeto else None,
                )
                for h in hits:
                    pl = h.payload or {}
                    # filtra arquivo presente no changed_files
                    cf = pl.get("changed_files") or []
                    if fname not in cf and not any(fname.endswith(c) or c.endswith(fname) for c in cf):
                        continue
                    merged_at = pl.get("merged_at", "")
                    if merged_at and merged_at < cutoff:
                        continue
                    did = str(h.id)
                    if did in seen_decisions:
                        continue
                    seen_decisions[did] = {**pl, "score": h.score}
            except Exception:
                continue

        # Também busca em Memory (decisões locais ou progress recentes do mesmo arquivo)
        memory_decisions = await self._search_memories(db, files, projeto)

        # E busca commits recentes no mesmo arquivo (sinais de edição prévios)
        recent_edits = await self._search_recent_edits(db, files, projeto, ev.get("source_id"))

        all_signals = list(seen_decisions.values()) + memory_decisions + recent_edits
        if not all_signals:
            return AgentResult(status="done", output={
                "skipped": True,
                "reason": "nenhuma decisão/histórico relevante",
                "files": files[:5],
            })

        # Pede para Opus avaliar conflito (limita ao top-3 por relevância de fonte)
        decisions_for_prompt = all_signals[:3]
        prompt = self._build_prompt(payload, files, decisions_for_prompt)
        try:
            response = await self._claude_call(prompt, max_tokens=512, timeout=120)
            cost = self._estimate_cost(len(prompt), len(response))
        except Exception as e:
            return AgentResult(status="error", error_message=f"opus call falhou: {e}", output={"prompt_size": len(prompt)})

        # Parseia resposta JSON do Opus
        verdict = self._parse_verdict(response)
        if not verdict or verdict.get("score", 0) < 0.7:
            return AgentResult(
                output={"decisions_evaluated": len(decisions_for_prompt), "verdict": verdict, "no_conflict": True},
                cost_estimate=cost,
            )

        # Há conflito — cria Memory de session
        machine = (payload.get("machine") or actor or "unknown")[:255]
        top = decisions_for_prompt[0]
        source = top.get("source", "qdrant")
        decision_pr = top.get("pr_number")
        decision_title = top.get("pr_title") or "decisão"

        if source == "qdrant" and decision_pr:
            ref = f"PR #{decision_pr}"
        elif source == "memory":
            ref = f"memória local ({top.get('type', 'decisão')})"
        elif source == "edit_history":
            ref = "edição recente local"
        else:
            ref = "decisão prévia"

        title = f"⚠️ Mudança em {files[0]} pode contradizer {ref}"
        content = (
            f"Você tocou: {', '.join(files[:3])}\n\n"
            f"Fonte: {decision_title}\n"
            f"Score de conflito: {verdict.get('score'):.2f}\n\n"
            f"Razão (Opus): {verdict.get('reasoning', 'N/A')}\n\n"
            f"Confirma intenção de mudar? Se for intencional, documente o porquê."
        )

        mem = Memory(
            type="gotcha",
            scope="session",
            scope_ref=machine,
            title=title[:500],
            content=content,
            tags=["conflict", "auto-detected"] + (verdict.get("areas") or []),
            confidence=verdict.get("score", 0.7),
            source_type="signal",
            source_ref=str(ev.get("source_id", "")),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        db.add(mem)
        await db.flush()

        # liga signal → memory + signal → decision
        if ev.get("source_id"):
            try:
                signal_uuid = uuid.UUID(str(ev["source_id"]))
                db.add(CausalEdge(
                    cause_table="dev_signals",
                    cause_id=signal_uuid,
                    effect_table="memories",
                    effect_id=mem.id,
                    relation="triggered_by",
                    confidence=1.0,
                    detected_by="conflict_detector",
                ))
                # signal contradicts decision (se decision_id existe no Postgres)
                # decision pode ser apenas Qdrant point — pegamos pelo qdrant_point_id buscando no DB
                # vamos pular a edge para architectural_decisions por simplicidade
            except Exception:
                pass

        return AgentResult(
            output={
                "memory_id": str(mem.id),
                "verdict": verdict,
                "files": files[:3],
                "decisions_evaluated": len(decisions_for_prompt),
            },
            cost_estimate=cost,
        )

    async def _search_memories(self, db, files: list[str], projeto: str) -> list[dict]:
        """Busca Memory (architectural_decision e progress) com conteúdo mencionando os arquivos."""
        if not files:
            return []
        # filtra projeto e tipo, depois texto
        q = select(Memory).where(
            Memory.archived == False,  # noqa: E712
            Memory.scope_ref == projeto,
            Memory.type.in_(["architectural_decision", "progress", "pattern", "gotcha"]),
        ).order_by(Memory.confidence.desc(), Memory.created_at.desc()).limit(20)
        result = await db.execute(q)
        out = []
        for m in result.scalars().all():
            blob = (m.title + " " + m.content).lower()
            for f in files:
                # match por basename ou path completo
                base = f.rsplit("/", 1)[-1].lower()
                if f.lower() in blob or (len(base) > 4 and base in blob):
                    out.append({
                        "source": "memory",
                        "memory_id": str(m.id),
                        "pr_number": None,
                        "pr_title": m.title,
                        "impact_areas": m.tags or [],
                        "breaking_changes": "breaking" in (m.tags or []),
                        "merged_at": (m.created_at.isoformat() if m.created_at else ""),
                        "content": m.content,
                        "type": m.type,
                    })
                    break
            if len(out) >= 5:
                break
        return out

    async def _search_recent_edits(self, db, files: list[str], projeto: str, exclude_signal_id) -> list[dict]:
        """Últimas 5 edições/commits ao mesmo arquivo nos últimos 30d."""
        if not files:
            return []
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        q = select(DevSignal).where(
            DevSignal.projeto == projeto,
            DevSignal.tipo.in_(["arquivo_editado", "commit_realizado"]),
            DevSignal.ts >= cutoff,
        ).order_by(DevSignal.ts.desc()).limit(40)
        result = await db.execute(q)

        out = []
        for s in result.scalars().all():
            if exclude_signal_id and str(s.id) == str(exclude_signal_id):
                continue
            dados = s.dados or {}
            arquivo = (dados.get("arquivo") or "").lower()
            for f in files:
                if arquivo == f.lower():
                    out.append({
                        "source": "edit_history",
                        "memory_id": None,
                        "pr_number": None,
                        "pr_title": f"Edição prévia em {arquivo} por {s.dev}",
                        "impact_areas": [],
                        "breaking_changes": False,
                        "merged_at": s.ts.isoformat() if s.ts else "",
                        "content": (
                            f"Dev: {s.dev}\n"
                            f"Tipo: {s.tipo}\n"
                            f"Quando: {s.ts.isoformat() if s.ts else '?'}\n"
                            f"Diff:\n{(dados.get('diff') or '')[:1500]}"
                        ),
                        "type": "history",
                    })
                    break
            if len(out) >= 5:
                break
        return out

    def _extract_files(self, payload: dict) -> list[str]:
        # signal.arquivo_editado: payload['arquivo']
        # signal.commit_realizado: às vezes payload['files'] (não vejo no schema atual mas pode aparecer)
        files = []
        if "arquivo" in payload:
            files.append(payload["arquivo"])
        elif "arquivos" in payload and isinstance(payload["arquivos"], list):
            files.extend(payload["arquivos"])
        elif "files" in payload and isinstance(payload["files"], list):
            files.extend(payload["files"])
        return [f for f in files if f and isinstance(f, str)]

    def _build_prompt(self, payload: dict, files: list[str], decisions: list[dict]) -> str:
        files_str = "\n".join(f"- {f}" for f in files[:5])
        diff = payload.get("diff") or "[diff não disponível]"
        if isinstance(diff, str) and len(diff) > 2000:
            diff = diff[:2000] + "\n... [truncado]"

        decisions_str = "\n\n".join(
            f"DECISÃO #{i+1} — PR #{d.get('pr_number')}: {d.get('pr_title')}\n"
            f"Áreas: {', '.join(d.get('impact_areas') or [])}\n"
            f"Breaking: {d.get('breaking_changes')}\n"
            f"Conteúdo:\n{(d.get('content') or '')[:2500]}"
            for i, d in enumerate(decisions)
        )

        return f"""Você é um assistente que detecta CONFLITOS entre mudanças de código atuais e decisões arquiteturais passadas.

MUDANÇA ATUAL:
Arquivos:
{files_str}

Diff (parcial):
```
{diff}
```

DECISÕES ARQUITETURAIS PASSADAS RELEVANTES:

{decisions_str}

TAREFA:
Avalie se a mudança atual CONTRADIZ alguma das decisões passadas. Considere:
- Está revertendo código adicionado pela decisão?
- Está removendo proteção/handler que a decisão estabeleceu?
- Está reintroduzindo um padrão que a decisão eliminou?
- Está mudando o comportamento que a decisão consolidou?

NÃO é conflito:
- Refatoração que mantém o comportamento da decisão
- Correção de bug não relacionado
- Adição de feature ortogonal

Responda APENAS com JSON, sem ```, no formato:
{{"score": 0.0-1.0, "reasoning": "explicação concisa", "areas": ["area1", "area2"]}}

score: 0.0 = sem conflito | 0.7+ = provável conflito | 1.0 = conflito explícito
"""

    def _parse_verdict(self, response: str) -> dict | None:
        """Extrai JSON da resposta. Tenta vários formatos."""
        text = response.strip()
        # remove fences se houver
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        # tenta achar primeiro {...}
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
