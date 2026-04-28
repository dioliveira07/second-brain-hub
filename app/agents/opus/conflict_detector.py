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


# Threshold mínimo de relevância (overlap de tokens diff↔candidato) para chamar Opus.
# Abaixo disso, retorna sem conflito direto — economiza chamadas Opus
# quando a mudança não tem relação semântica com decisões existentes.
# Calibrado pra ~1.0: 1 token overlap OU bônus de memory source já passa.
RELEVANCE_THRESHOLD = 1.0

# Dedupe: mesmo dev editando o mesmo arquivo em <DEDUPE_MIN min não dispara de novo.
DEDUPE_MIN = 10


# Tiered escalation: Sonnet default (5x mais barato).
# Escalada para Opus só quando Sonnet ≥ ESCALATE_LOW (sinal de conflito real
# mas abaixo do threshold de 0.7). Score final = max(sonnet, opus) — Opus
# tende a ser conservador e downgrades scores que Sonnet acerta.
# Sonnet < 0.5 é confiança suficiente em "no_conflict", não escala.
ESCALATE_LOW = 0.5
ESCALATE_HIGH = 0.7


@register
class ConflictDetector(AgentBase):
    NAME = "conflict_detector"
    MODEL = "sonnet"  # default barato — escala pra opus em zona cinza
    # Só commit_realizado (pontos de decisão real, não edits intermediários WIP).
    # Arquivo_editado seria 10x o volume com sinal mais ruidoso.
    SUBSCRIBES = (
        "signal.commit_realizado",
    )

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        ev = event or input or {}
        payload = ev.get("payload", {}) or {}
        projeto = ev.get("projeto") or ""
        actor = ev.get("actor") or "unknown"

        # Override de modelo via input (para benchmark sonnet vs opus)
        override_model = (input or {}).get("model_override") or payload.get("model_override")
        if override_model in ("sonnet", "opus", "haiku"):
            self._original_model = self.MODEL
            self.MODEL = override_model

        # Extrai arquivos tocados
        files = self._extract_files(payload)
        if not files:
            return AgentResult(status="done", output={"skipped": True, "reason": "sem arquivos no payload"})

        # Dedupe via Redis: evita re-disparar para mesmo dev+arquivo em DEDUPE_MIN min.
        # Bypass via input.skip_dedupe (útil para testes e replays).
        if not (input or {}).get("skip_dedupe") and not payload.get("skip_dedupe"):
            dedupe_skip = await self._check_dedupe(actor, files)
            if dedupe_skip:
                return AgentResult(status="done", output={"skipped": True, "reason": "dedupe", "files": files[:5]})

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

        # Ranquear por overlap semântico com o diff (palavras-chave compartilhadas)
        diff_text = (payload.get("diff") or "").lower()
        all_signals = self._rank_by_relevance(all_signals, diff_text)

        # Pre-filter: skip Opus se nenhum candidato tem overlap suficiente.
        # Score do top é overlap_count + bônus de fonte. Se for < threshold,
        # significa que apesar de ter histórico no arquivo, semanticamente
        # nada se relaciona à mudança atual.
        top_score = self._relevance_score(all_signals[0], diff_text) if all_signals else 0.0
        if top_score < RELEVANCE_THRESHOLD:
            return AgentResult(status="done", output={
                "skipped": True,
                "reason": f"relevância insuficiente (top={top_score:.1f} < {RELEVANCE_THRESHOLD})",
                "candidates_count": len(all_signals),
                "files": files[:5],
            })

        # Marca dedupe AGORA (antes do Opus call) para evitar burst de triggers paralelos
        await self._mark_dedupe(actor, files)

        # Top-5 candidatos
        decisions_for_prompt = all_signals[:5]
        prompt = self._build_prompt(payload, files, decisions_for_prompt)

        try:
            response = await self._claude_call(prompt, max_tokens=512, timeout=120)
            cost = self._estimate_cost(len(prompt), len(response))
        except Exception as e:
            return AgentResult(status="error", error_message=f"{self.MODEL} call falhou: {e}", output={"prompt_size": len(prompt)})

        verdict = self._parse_verdict(response)
        used_model = self.MODEL
        escalated = False

        # Escalada opt-in: input.escalate=true ou payload.escalate=true para forçar
        # double-check com Opus quando Sonnet retorna score em zona cinza.
        # Default desabilitado: benchmark mostrou Sonnet sozinho mais consistente
        # (14/15 estável vs 13-15/15 com escalation).
        escalate_requested = (
            (input or {}).get("escalate") or payload.get("escalate")
        )
        if (verdict and escalate_requested
            and self.MODEL == "sonnet"
            and ESCALATE_LOW <= (verdict.get("score") or 0) <= ESCALATE_HIGH):
            sonnet_score = verdict.get("score") or 0
            sonnet_verdict = verdict
            self.MODEL = "opus"
            try:
                response2 = await self._claude_call(prompt, max_tokens=512, timeout=120)
                cost += self._estimate_cost(len(prompt), len(response2))
                verdict2 = self._parse_verdict(response2)
                if verdict2:
                    opus_score = verdict2.get("score") or 0
                    # Usa o veredito com maior score; preserva ambos os reasonings
                    if opus_score >= sonnet_score:
                        verdict = verdict2
                        used_model = "opus"
                    else:
                        # Mantém Sonnet mas registra que Opus achou menor
                        verdict["score"] = sonnet_score  # explicit
                        verdict["opus_score"] = opus_score
                        used_model = "sonnet+opus"
                    escalated = True
            except Exception:
                pass  # mantém veredito Sonnet em caso de falha
            finally:
                self.MODEL = "sonnet"

        if not verdict or verdict.get("score", 0) < 0.7:
            return AgentResult(
                output={
                    "decisions_evaluated": len(decisions_for_prompt),
                    "verdict": verdict,
                    "no_conflict": True,
                    "used_model": used_model,
                    "escalated": escalated,
                },
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
                "used_model": used_model,
                "escalated": escalated,
            },
            cost_estimate=cost,
        )

    async def _search_memories(self, db, files: list[str], projeto: str) -> list[dict]:
        """Busca Memory (architectural_decision/progress/pattern/gotcha) por:
        1. Tag exata `file:<path>` (preferido — match rápido e preciso)
        2. Match de path/basename no title+content (fallback)
        """
        if not files:
            return []
        q = select(Memory).where(
            Memory.archived == False,  # noqa: E712
            Memory.scope_ref == projeto,
            Memory.type.in_(["architectural_decision", "progress", "pattern", "gotcha"]),
        ).order_by(Memory.confidence.desc(), Memory.created_at.desc()).limit(50)
        result = await db.execute(q)

        out = []
        seen_ids = set()
        # Match por tag (preferencial)
        file_tags = {f"file:{f}" for f in files}
        for m in result.scalars().all():
            tags = set(m.tags or [])
            if tags & file_tags:
                if m.id in seen_ids:
                    continue
                seen_ids.add(m.id)
                out.append(self._memory_to_decision_dict(m, "memory_tag"))
                if len(out) >= 5:
                    return out

        # Match por content (fallback)
        for m in result.scalars().all() if False else []:
            pass  # noop; reusamos result acima
        # Re-query para pegar memories sem tag-match
        result2 = await db.execute(q)
        for m in result2.scalars().all():
            if m.id in seen_ids:
                continue
            blob = (m.title + " " + m.content).lower()
            for f in files:
                base = f.rsplit("/", 1)[-1].lower()
                if f.lower() in blob or (len(base) > 4 and base in blob):
                    seen_ids.add(m.id)
                    out.append(self._memory_to_decision_dict(m, "memory_text"))
                    break
            if len(out) >= 5:
                break
        return out

    def _relevance_score(self, signal: dict, diff_text: str) -> float:
        """Score de relevância signal↔diff por overlap de tokens + bônus de fonte."""
        if not diff_text:
            return 0.0
        diff_tokens = set(re.findall(r"[a-z_][a-z0-9_]{3,}", diff_text))
        if not diff_tokens:
            return 0.0
        text = ((signal.get("pr_title") or "") + " " + (signal.get("content") or "")).lower()
        tokens = set(re.findall(r"[a-z_][a-z0-9_]{3,}", text))
        overlap = len(diff_tokens & tokens)
        bonus = 0.0
        src = signal.get("source", "")
        if src.startswith("memory"):
            bonus += 1.0  # memórias são fonte explícita de decisão
        if src == "qdrant":
            bonus += 2.0  # PR mergeado é a fonte mais autoritativa
        return overlap + bonus

    def _rank_by_relevance(self, signals: list[dict], diff_text: str) -> list[dict]:
        """Ranqueia signals por relevance score. Mantém ordem original em empate."""
        if not diff_text:
            return signals
        return sorted(signals, key=lambda s: self._relevance_score(s, diff_text), reverse=True)

    async def _check_dedupe(self, dev: str, files: list[str]) -> bool:
        """True se algum (dev, file) já foi processado em DEDUPE_MIN min."""
        try:
            from app.services import event_bus
            r = await event_bus._get_redis()
            if not r:
                return False
            for f in files[:5]:
                key = f"cd:dedupe:{dev}:{f}"
                if await r.exists(key):
                    return True
        except Exception:
            pass
        return False

    async def _mark_dedupe(self, dev: str, files: list[str]):
        """Marca (dev, file) como processado, TTL DEDUPE_MIN min."""
        try:
            from app.services import event_bus
            r = await event_bus._get_redis()
            if not r:
                return
            for f in files[:5]:
                key = f"cd:dedupe:{dev}:{f}"
                await r.setex(key, DEDUPE_MIN * 60, "1")
        except Exception:
            pass

    def _memory_to_decision_dict(self, m, source: str) -> dict:
        return {
            "source": source,
            "memory_id": str(m.id),
            "pr_number": None,
            "pr_title": m.title,
            "impact_areas": [t for t in (m.tags or []) if not t.startswith("file:") and not t.startswith("branch:")],
            "breaking_changes": "breaking" in (m.tags or []),
            "merged_at": (m.created_at.isoformat() if m.created_at else ""),
            "content": m.content,
            "type": m.type,
        }

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
