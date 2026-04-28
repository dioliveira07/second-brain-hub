"""pattern_detector — varre events do dia/semana e extrai padrões.

SONNET — análise barata em batch noturno. Não precisa de raciocínio profundo:
estatística + agrupamento + síntese curta.

Cron: 4am diário.

Pipeline:
1. Busca events das últimas 7 dias por projeto
2. Agrupa por (tipo, dev, projeto):
   - Erros bash repetidos (mesmo cmd 3+ vezes em 7d) → "padrão de erro"
   - Sequências de arquivos editados juntos (par X+Y editado >= 3x) → "co-edit pattern"
   - Skills usadas em sucessão (skill A seguida de B 3+ vezes) → "workflow"
3. Cria Memory(type=pattern, scope=project, expires=None — patterns são duradouros)
4. Idempotência: se Memory equivalente já existe (mesma chave de pattern),
   incrementa access_count em vez de criar duplicata.

Resultado: o conhecimento tácito do time vira Memory recuperável.
"""
from __future__ import annotations

import asyncio
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentBase, AgentResult
from app.agents.registry import register
from app.db.models import Memory, DevSignal


WINDOW_DAYS = 7
MIN_OCCURRENCES_ERROR = 3
MIN_OCCURRENCES_COEDIT = 3
MIN_OCCURRENCES_WORKFLOW = 3


@register
class PatternDetector(AgentBase):
    NAME = "pattern_detector"
    MODEL = "sonnet"  # logical — usa LLM só para sintetizar título de pattern
    SUBSCRIBES = ()
    CRON = "0 4 * * *"  # 4am diário

    async def run(self, *, db: AsyncSession, event=None, input=None) -> AgentResult:
        since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)

        # Carrega todos events relevantes
        r = await db.execute(
            select(DevSignal).where(DevSignal.ts >= since).order_by(DevSignal.ts.asc())
        )
        signals = r.scalars().all()

        created = 0
        updated = 0
        candidates: list[dict] = []

        # 1. Padrões de erro
        candidates += self._detect_error_patterns(signals)
        # 2. Co-edits
        candidates += self._detect_coedit_patterns(signals)
        # 3. Workflow (skill A → B)
        candidates += self._detect_workflow_patterns(signals)

        for cand in candidates:
            existing = await self._find_existing(db, cand)
            if existing:
                existing.access_count = (existing.access_count or 0) + 1
                # boost confidence quando re-detectado
                existing.confidence = min(1.0, existing.confidence + 0.05)
                updated += 1
                continue
            mem = Memory(
                type="pattern",
                scope=cand["scope"],
                scope_ref=cand["scope_ref"],
                title=cand["title"][:500],
                content=cand["content"],
                tags=cand["tags"],
                confidence=cand["confidence"],
                source_type="derived",
                source_ref=cand.get("source_ref"),
                expires_at=None,
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

        return AgentResult(output={
            "created": created,
            "updated": updated,
            "candidates": len(candidates),
            "signals_scanned": len(signals),
        })

    # ── detectores ──────────────────────────────────────────────────────────

    def _detect_error_patterns(self, signals: list[DevSignal]) -> list[dict]:
        """Erros bash que se repetem N vezes — comando problemático sistêmico."""
        cmd_count: Counter[tuple[str, str]] = Counter()  # (projeto, cmd) → count
        cmd_devs: defaultdict[tuple[str, str], set] = defaultdict(set)

        for s in signals:
            if s.tipo != "erro_bash":
                continue
            cmd = self._decode_cmd((s.dados or {}).get("cmd_decoded") or (s.dados or {}).get("cmd") or "")
            if len(cmd) < 4:
                continue
            cmd_norm = self._normalize_cmd(cmd)
            key = (s.projeto, cmd_norm)
            cmd_count[key] += 1
            cmd_devs[key].add(s.dev)

        patterns = []
        for (projeto, cmd), count in cmd_count.items():
            if count < MIN_OCCURRENCES_ERROR:
                continue
            devs = sorted(cmd_devs[(projeto, cmd)])
            patterns.append({
                "scope": "project",
                "scope_ref": projeto,
                "title": f"Erro recorrente: `{cmd[:80]}` ({count}x)",
                "content": (
                    f"Comando: `{cmd[:200]}`\n"
                    f"Falhou {count} vezes nos últimos {WINDOW_DAYS} dias.\n"
                    f"Devs afetados: {', '.join(devs)}\n\n"
                    f"Padrão sistêmico — vale documentar a solução."
                ),
                "tags": ["pattern:error", f"cmd:{cmd[:30]}"] + [f"dev:{d}" for d in devs],
                "confidence": min(0.9, 0.4 + count * 0.05),
                "source_ref": f"err:{cmd[:30]}",
            })
        return patterns

    def _detect_coedit_patterns(self, signals: list[DevSignal]) -> list[dict]:
        """Pares de arquivos sempre editados juntos — sinaliza acoplamento."""
        # Agrupa por (dev, projeto, hour) para inferir "sessão de edit"
        sessions: defaultdict[tuple[str, str, str], set] = defaultdict(set)
        for s in signals:
            if s.tipo != "arquivo_editado":
                continue
            arquivo = (s.dados or {}).get("arquivo")
            if not arquivo:
                continue
            hour_key = s.ts.strftime("%Y-%m-%d-%H")
            sessions[(s.dev, s.projeto, hour_key)].add(arquivo)

        # Conta pares
        pair_count: Counter[tuple[str, str, str]] = Counter()  # (projeto, file_a, file_b)
        for (dev, projeto, _h), files in sessions.items():
            files_list = sorted(files)
            for i in range(len(files_list)):
                for j in range(i + 1, len(files_list)):
                    pair = (projeto, files_list[i], files_list[j])
                    pair_count[pair] += 1

        patterns = []
        for (projeto, fa, fb), count in pair_count.items():
            if count < MIN_OCCURRENCES_COEDIT:
                continue
            patterns.append({
                "scope": "project",
                "scope_ref": projeto,
                "title": f"Co-edit: {self._basename(fa)} ↔ {self._basename(fb)} ({count}x)",
                "content": (
                    f"Estes arquivos foram editados na mesma sessão {count} vezes "
                    f"em {WINDOW_DAYS} dias:\n"
                    f"- {fa}\n- {fb}\n\n"
                    f"Pode indicar acoplamento — ao mexer em um, considerar o outro."
                ),
                "tags": ["pattern:coedit", f"file:{fa}", f"file:{fb}"],
                "confidence": min(0.85, 0.3 + count * 0.05),
                "source_ref": f"coedit:{fa[-40:]}|{fb[-40:]}",
            })
        return patterns

    def _detect_workflow_patterns(self, signals: list[DevSignal]) -> list[dict]:
        """Skills usadas em sucessão A→B várias vezes — workflow do dev."""
        # Agrupa por dev em sessões temporais (skills usadas no mesmo dia)
        skill_seqs: defaultdict[tuple[str, str], list] = defaultdict(list)
        for s in signals:
            if s.tipo != "skill_usada":
                continue
            skill = (s.dados or {}).get("skill")
            if not skill:
                continue
            day_key = s.ts.strftime("%Y-%m-%d")
            skill_seqs[(s.dev, day_key)].append((s.ts, skill))

        # Conta transições A → B (skill A seguida de skill B no mesmo dia)
        transitions: Counter[tuple[str, str]] = Counter()
        for (_dev, _day), seq in skill_seqs.items():
            seq.sort()
            for i in range(len(seq) - 1):
                a, b = seq[i][1], seq[i + 1][1]
                if a != b:
                    transitions[(a, b)] += 1

        patterns = []
        for (a, b), count in transitions.items():
            if count < MIN_OCCURRENCES_WORKFLOW:
                continue
            patterns.append({
                "scope": "global",
                "scope_ref": None,
                "title": f"Workflow: /{a} → /{b} ({count}x)",
                "content": (
                    f"A skill /{a} é seguida pela skill /{b} em {count} ocorrências "
                    f"no mesmo dia, em {WINDOW_DAYS} dias.\n\n"
                    f"Workflow recorrente — pode virar uma skill composta."
                ),
                "tags": ["pattern:workflow", f"skill:{a}", f"skill:{b}"],
                "confidence": min(0.85, 0.3 + count * 0.05),
                "source_ref": f"wf:{a}->{b}",
            })
        return patterns

    # ── helpers ─────────────────────────────────────────────────────────────

    async def _find_existing(self, db, cand: dict) -> Memory | None:
        if not cand.get("source_ref"):
            return None
        r = await db.execute(
            select(Memory).where(
                Memory.type == "pattern",
                Memory.source_ref == cand["source_ref"],
                Memory.archived == False,  # noqa: E712
            )
        )
        return r.scalar_one_or_none()

    def _decode_cmd(self, raw) -> str:
        if not raw or not isinstance(raw, str):
            return ""
        if re.fullmatch(r"[A-Za-z0-9+/=]+", raw) and len(raw) > 8:
            try:
                import base64
                decoded = base64.b64decode(raw).decode("utf-8", errors="replace")
                if all(c.isprintable() or c in "\t\n" for c in decoded):
                    return decoded[:500]
            except Exception:
                pass
        return raw[:500]

    def _normalize_cmd(self, cmd: str) -> str:
        """Normaliza cmd: remove paths/argumentos numéricos pra agrupar similares."""
        s = re.sub(r"\s+", " ", cmd.strip().lower())
        s = re.sub(r"/[^\s]+", "<PATH>", s)
        s = re.sub(r"\b\d+\b", "<N>", s)
        return s[:200]

    def _basename(self, path: str) -> str:
        return path.rsplit("/", 1)[-1]
