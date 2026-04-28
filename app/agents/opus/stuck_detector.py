"""stuck_detector — detecta dev travado em loop de erros e sugere saída.

OPUS — usa raciocínio profundo pra correlacionar erro recorrente com
soluções históricas e propor próximo passo.

Inscrito em:
- signal.erro_bash       — trigger imediato em erro novo

Pipeline:
1. Recebe signal.erro_bash com cmd + returncode
2. Conta ocorrências do mesmo cmd nos últimos 30min pelo mesmo dev
3. Se N >= 3 → dev está travado
4. Busca memórias do tipo gotcha/pattern relacionadas ao cmd ou erro
5. Busca sequência de events ao redor (commits, edits, prompts) pra
   entender o contexto da tentativa atual
6. Opus avalia e gera sugestão concreta com referência histórica
7. Cria Memory(type=gotcha, scope=session, expires=2h) — injetada no
   próximo prompt do dev

Anti-spam: dedupe via Redis (mesmo cmd + dev em <60min só dispara 1x).
"""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory, DevSignal, AgentSubscription


STUCK_THRESHOLD = 3        # mesmo cmd N vezes
STUCK_WINDOW_MIN = 30      # nos últimos N minutos
DEDUPE_MIN = 60            # bloqueia re-trigger por N min


@register
class StuckDetector(AgentBase):
    NAME = "stuck_detector"
    MODEL = "opus"
    SUBSCRIBES = ("signal.erro_bash",)

    async def run(self, *, db: AsyncSession, event: dict | None = None, input: dict | None = None) -> AgentResult:
        ev = event or input or {}
        payload = ev.get("payload", {}) or {}
        actor = ev.get("actor") or "unknown"
        projeto = ev.get("projeto") or ""

        # Subscription gate (mesmo padrão do conflict_detector)
        skip_sub = (input or {}).get("skip_subscription") or payload.get("skip_subscription")
        if not skip_sub and projeto:
            sub_q = await db.execute(
                select(AgentSubscription).where(
                    AgentSubscription.agent_name == self.NAME,
                    AgentSubscription.projeto == projeto,
                    AgentSubscription.enabled == True,  # noqa: E712
                )
            )
            if not sub_q.scalar_one_or_none():
                return AgentResult(status="done", output={
                    "skipped": True,
                    "reason": f"projeto '{projeto}' sem subscription para stuck_detector",
                })

        # Extrai cmd do payload (post_bash_error envia cmd em base64)
        cmd_raw = payload.get("cmd") or payload.get("cmd_decoded") or ""
        if not cmd_raw:
            return AgentResult(status="done", output={"skipped": True, "reason": "sem cmd no payload"})

        # Decodifica se for base64 (caso novo)
        cmd = self._decode_cmd(cmd_raw)
        if len(cmd) < 4:
            return AgentResult(status="done", output={"skipped": True, "reason": "cmd muito curto"})

        # Dedupe via Redis
        if not skip_sub:
            if await self._is_deduped(actor, cmd):
                return AgentResult(status="done", output={"skipped": True, "reason": "dedupe"})

        # Conta ocorrências do mesmo cmd nos últimos N min
        since = datetime.now(timezone.utc) - timedelta(minutes=STUCK_WINDOW_MIN)
        count_q = await db.execute(
            select(func.count(DevSignal.id)).where(
                DevSignal.dev == actor,
                DevSignal.tipo == "erro_bash",
                DevSignal.ts >= since,
            )
        )
        # NB: filtragem fina por cmd igual feita em Python (cmd está em dados.cmd / dados.cmd_decoded)
        recent_q = await db.execute(
            select(DevSignal).where(
                DevSignal.dev == actor,
                DevSignal.tipo == "erro_bash",
                DevSignal.ts >= since,
            ).order_by(DevSignal.ts.desc()).limit(20)
        )
        same_cmd_count = 0
        for s in recent_q.scalars().all():
            other_cmd = self._decode_cmd(
                (s.dados or {}).get("cmd") or (s.dados or {}).get("cmd_decoded") or ""
            )
            if self._cmds_similar(cmd, other_cmd):
                same_cmd_count += 1

        if same_cmd_count < STUCK_THRESHOLD:
            return AgentResult(status="done", output={
                "skipped": True,
                "reason": f"abaixo do threshold ({same_cmd_count} < {STUCK_THRESHOLD})",
                "cmd": cmd[:100],
            })

        # Marca dedupe agora
        await self._mark_dedupe(actor, cmd)

        # Busca memórias relacionadas (gotchas, patterns, progresses sobre comando ou erro)
        related_memories = await self._find_related(db, projeto, cmd, actor)

        # Constrói prompt para Opus
        prompt = self._build_prompt(cmd, same_cmd_count, related_memories, payload)

        try:
            response, usage = await self._claude_call(
                prompt, max_tokens=512, timeout=120,
                system_prompt=(
                    "Você é um assistente que detecta quando um desenvolvedor está travado "
                    "(erro repetido). Sua resposta deve sugerir UMA ação concreta que tem "
                    "alta probabilidade de resolver, baseada no histórico fornecido. "
                    "Responda em pt-BR, direto, máximo 3 linhas. JSON: "
                    '{"sugestao": "...", "confianca": 0-1, "fonte": "memoria/heuristica"}.'
                ),
            )
            cost = usage.get("_total_cost_usd") or self._estimate_cost(len(prompt), len(response))
        except Exception as e:
            return AgentResult(status="error", error_message=f"opus call falhou: {e}")

        verdict = self._parse_verdict(response)
        if not verdict or not verdict.get("sugestao"):
            return AgentResult(status="done", output={"verdict": verdict, "no_suggestion": True}, cost_estimate=cost)

        # Cria Memory de session com a sugestão
        machine = (payload.get("machine") or actor or "unknown")[:255]
        title = f"⚠️ Travado em `{cmd[:40]}` ({same_cmd_count}x em {STUCK_WINDOW_MIN}min)"
        content = (
            f"Comando: `{cmd[:200]}`\n"
            f"Falhou {same_cmd_count} vezes nos últimos {STUCK_WINDOW_MIN} min.\n\n"
            f"Sugestão (Opus, conf. {verdict.get('confianca', 0):.2f}, fonte: {verdict.get('fonte', '?')}):\n"
            f"{verdict['sugestao']}"
        )

        mem = Memory(
            type="gotcha",
            scope="session",
            scope_ref=machine,
            title=title[:500],
            content=content,
            tags=["stuck", "auto-detected", f"cmd:{cmd[:30]}"],
            confidence=verdict.get("confianca", 0.7),
            source_type="signal",
            source_ref=str(ev.get("source_id", "")),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        )
        db.add(mem)
        await db.flush()

        # Indexa no Qdrant
        try:
            from app.services import memory_qdrant
            await asyncio.to_thread(memory_qdrant.index_memory, mem)
        except Exception:
            pass

        return AgentResult(
            output={
                "memory_id": str(mem.id),
                "verdict": verdict,
                "occurrences": same_cmd_count,
                "related_memories": len(related_memories),
            },
            cost_estimate=cost,
        )

    # ── helpers ─────────────────────────────────────────────────────────────

    def _decode_cmd(self, raw) -> str:
        """Decodifica base64 se aplicável; senão retorna como veio."""
        if not raw or not isinstance(raw, str):
            return ""
        # Se parece base64 puro (chars válidos, len > 8, sem espaços), tenta decode
        if re.fullmatch(r"[A-Za-z0-9+/=]+", raw) and len(raw) > 8:
            try:
                import base64
                decoded = base64.b64decode(raw).decode("utf-8", errors="replace")
                # se decoded contém chars não imprimíveis, retorna raw
                if all(c.isprintable() or c in "\t\n" for c in decoded):
                    return decoded[:500]
            except Exception:
                pass
        return raw[:500]

    def _cmds_similar(self, a: str, b: str) -> bool:
        """Compara comandos ignorando args triviais (paths, números). Match em prefixo."""
        if not a or not b:
            return False
        norm_a = re.sub(r"\s+", " ", a).strip().lower()
        norm_b = re.sub(r"\s+", " ", b).strip().lower()
        # match exato
        if norm_a == norm_b:
            return True
        # match nos primeiros 4 tokens (binário + 3 args principais)
        toks_a = norm_a.split()[:4]
        toks_b = norm_b.split()[:4]
        return toks_a == toks_b

    async def _is_deduped(self, dev: str, cmd: str) -> bool:
        try:
            from app.services import event_bus
            r = await event_bus._get_redis()
            if not r:
                return False
            key = f"sd:dedupe:{dev}:{cmd[:50]}"
            return bool(await r.exists(key))
        except Exception:
            return False

    async def _mark_dedupe(self, dev: str, cmd: str):
        try:
            from app.services import event_bus
            r = await event_bus._get_redis()
            if not r:
                return
            key = f"sd:dedupe:{dev}:{cmd[:50]}"
            await r.setex(key, DEDUPE_MIN * 60, "1")
        except Exception:
            pass

    async def _find_related(self, db, projeto: str, cmd: str, dev: str) -> list[dict]:
        """Busca memórias e signals relacionados ao cmd ou erro similar."""
        # Tokens-chave do cmd
        tokens = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_-]{2,}", cmd))[:10] if False else \
                 set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_-]{2,}", cmd))

        # Busca Memory(gotcha, pattern) com tag/conteúdo relacionado
        q = select(Memory).where(
            Memory.archived == False,  # noqa: E712
            Memory.scope_ref == projeto,
            Memory.type.in_(["gotcha", "pattern"]),
        ).order_by(Memory.confidence.desc(), Memory.created_at.desc()).limit(30)
        result = await db.execute(q)

        related = []
        for m in result.scalars().all():
            content_lower = ((m.title or "") + " " + (m.content or "")).lower()
            cmd_lower = cmd.lower()
            # match: cmd no content, ou >= 2 tokens em comum
            common_tokens = sum(1 for t in tokens if t.lower() in content_lower)
            if cmd_lower[:30] in content_lower or common_tokens >= 2:
                related.append({
                    "title": m.title,
                    "content": (m.content or "")[:600],
                    "type": m.type,
                    "confidence": m.confidence,
                })
            if len(related) >= 5:
                break
        return related

    def _build_prompt(self, cmd: str, count: int, related: list[dict], payload: dict) -> str:
        related_str = "\n\n".join(
            f"MEMORIA #{i+1} ({m['type']}, conf={m['confidence']:.2f}):\n"
            f"  {m['title']}\n  {m['content'][:400]}"
            for i, m in enumerate(related)
        ) if related else "(nenhuma memória relacionada)"

        rc = payload.get("returncode", "?")
        return f"""Um desenvolvedor está travado em um loop de erro.

COMANDO QUE FALHA:
```
{cmd[:600]}
```

Returncode: {rc}
Falhou {count} vezes nos últimos {STUCK_WINDOW_MIN} minutos.

MEMÓRIAS RELACIONADAS (gotchas/patterns do mesmo projeto):

{related_str}

TAREFA:
Sugira UMA ação concreta que provavelmente resolve. Priorize sugestões baseadas
em memórias quando aplicável. Se nenhuma memória parecer relevante, use
heurísticas comuns (ex: limpar cache, reinstalar deps, checar permissões).

Responda APENAS JSON: {{"sugestao": "...", "confianca": 0-1, "fonte": "memoria/heuristica"}}
"""

    def _parse_verdict(self, text: str) -> dict | None:
        text = re.sub(r"^```(?:json)?\s*", "", text.strip())
        text = re.sub(r"\s*```$", "", text)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
