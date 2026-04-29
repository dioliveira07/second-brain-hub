"""
Cerebro — APIs de contexto de sessão e sinais de atividade.
F2: padrões de erro por projeto
F3: afinidade dev × projeto
F6: continuidade entre devs (última sessão por projeto)
"""
import asyncio
import base64
import hashlib
import hmac
import logging
import math
import os
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header, Request, Query
from pydantic import BaseModel
from sqlalchemy import select, delete, or_, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.db.models import (
    SessionContext, DevSignal, MCPConnection, SSHIdentity, ChatMessage,
    LocalDev, Notification,
    Memory, Event, CausalEdge, AgentRun, AgentSubscription,
)
from app.services import event_bus as _event_bus
from app.services import memory_qdrant as _memory_qdrant

router = APIRouter()


# ── Admin auth ─────────────────────────────────────────────────────────────────

def require_admin(request: Request, x_admin_token: str = Header(None)):
    if not settings.admin_token or not x_admin_token:
        logging.getLogger("hub.auth").warning("[ADMIN] Tentativa sem token — %s %s", request.method, request.url.path)
        raise HTTPException(status_code=403, detail="Token admin inválido")
    if not secrets.compare_digest(x_admin_token, settings.admin_token):
        logging.getLogger("hub.auth").warning("[ADMIN] Token inválido — %s %s ip=%s", request.method, request.url.path, request.client.host if request.client else "?")
        raise HTTPException(status_code=403, detail="Token admin inválido")
    logging.getLogger("hub.auth").info("[ADMIN] Ação autorizada — %s %s ip=%s", request.method, request.url.path, request.client.host if request.client else "?")


async def get_isolated_owner(dev: str, db: AsyncSession) -> str | None:
    """Retorna dev.name se dev for LocalDev com isolated=True, senão None."""
    result = await db.execute(select(LocalDev).where(LocalDev.name == dev))
    ld = result.scalar_one_or_none()
    return dev if (ld and ld.isolated) else None


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessaoPayload(BaseModel):
    dev: str
    projeto: str
    branch: str = ""
    arquivos: list[str] = []
    ultimo_commit: str = ""
    timestamp: str  # ISO 8601


class MensagemPayload(BaseModel):
    dev: str
    projeto: str
    turno: int = 0
    role: str = "user"
    texto: str
    timestamp: str  # ISO 8601
    session_id: str | None = None


class SinalPayload(BaseModel):
    tipo: str        # erro_bash | arquivo_editado | skill_usada
    dev: str = "desconhecido"
    projeto: str
    dados: dict = {}
    timestamp: str   # ISO 8601


# ── F6: Sessão ─────────────────────────────────────────────────────────────────

@router.post("/sessao")
async def salvar_sessao(payload: SessaoPayload, db: AsyncSession = Depends(get_db)):
    """Salva (upsert) snapshot da sessão de um dev em um projeto."""
    ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
    isolated_owner = await get_isolated_owner(payload.dev, db)

    result = await db.execute(
        select(SessionContext).where(
            SessionContext.dev == payload.dev,
            SessionContext.projeto == payload.projeto,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.branch = payload.branch
        existing.arquivos = payload.arquivos
        existing.ultimo_commit = payload.ultimo_commit
        existing.timestamp = ts
        existing.isolated_owner = isolated_owner
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(SessionContext(
            dev=payload.dev,
            projeto=payload.projeto,
            branch=payload.branch,
            arquivos=payload.arquivos,
            ultimo_commit=payload.ultimo_commit,
            timestamp=ts,
            isolated_owner=isolated_owner,
        ))

    await db.commit()
    return {"status": "ok"}


@router.get("/projeto/{projeto}/contexto")
async def get_contexto_projeto(projeto: str, db: AsyncSession = Depends(get_db)):
    """Retorna a sessão mais recente (de qualquer dev não-isolado) no projeto."""
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.projeto == projeto, SessionContext.isolated_owner.is_(None))
        .order_by(SessionContext.timestamp.desc())
        .limit(1)
    )
    s = result.scalar_one_or_none()
    if not s:
        return {}  # projeto sem histórico — retorna vazio sem quebrar o caller

    agora = datetime.now(timezone.utc)
    minutos_atras = int((agora - s.timestamp).total_seconds() / 60)

    return {
        "dev": s.dev,
        "projeto": s.projeto,
        "branch": s.branch,
        "arquivos": s.arquivos,
        "ultimo_commit": s.ultimo_commit,
        "timestamp": s.timestamp.isoformat(),
        "minutos_atras": minutos_atras,
    }


@router.get("/sessoes")
async def get_todas_sessoes(limit: int = 30, db: AsyncSession = Depends(get_db)):
    """Retorna sessões recentes de devs não-isolados."""
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.isolated_owner.is_(None))
        .order_by(SessionContext.timestamp.desc())
        .limit(limit)
    )
    sessoes = result.scalars().all()
    agora = datetime.now(timezone.utc)
    return [
        {
            "dev": s.dev,
            "projeto": s.projeto,
            "branch": s.branch,
            "arquivos": s.arquivos,
            "ultimo_commit": s.ultimo_commit,
            "minutos_atras": int((agora - s.timestamp).total_seconds() / 60),
            "timestamp": s.timestamp.isoformat(),
        }
        for s in sessoes
    ]


@router.get("/sessoes/ativas")
async def get_sessoes_ativas(janela_minutos: int = 60, db: AsyncSession = Depends(get_db)):
    """Retorna sessões ativas de devs não-isolados."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=janela_minutos)
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.timestamp >= cutoff, SessionContext.isolated_owner.is_(None))
        .order_by(SessionContext.timestamp.desc())
    )
    sessoes = result.scalars().all()
    agora = datetime.now(timezone.utc)
    return [
        {
            "dev": s.dev,
            "projeto": s.projeto,
            "branch": s.branch,
            "arquivos": s.arquivos,
            "ultimo_commit": s.ultimo_commit,
            "minutos_atras": int((agora - s.timestamp).total_seconds() / 60),
            "timestamp": s.timestamp.isoformat(),
        }
        for s in sessoes
    ]


@router.get("/projeto/{projeto}/sessoes")
async def get_sessoes_projeto(projeto: str, limit: int = 10, db: AsyncSession = Depends(get_db)):
    """Retorna todas as sessões recentes do projeto (todos os devs)."""
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.projeto == projeto)
        .order_by(SessionContext.timestamp.desc())
        .limit(limit)
    )
    sessoes = result.scalars().all()
    agora = datetime.now(timezone.utc)
    return [
        {
            "dev": s.dev,
            "branch": s.branch,
            "arquivos": s.arquivos,
            "ultimo_commit": s.ultimo_commit,
            "minutos_atras": int((agora - s.timestamp).total_seconds() / 60),
        }
        for s in sessoes
    ]


# ── Chat Messages ─────────────────────────────────────────────────────────────

@router.post("/mensagem")
async def registrar_mensagem(payload: MensagemPayload, db: AsyncSession = Depends(get_db)):
    """Registra o prompt enviado pelo dev em uma sessão Claude Code. Ignora duplicatas."""
    ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
    existing = await db.execute(
        select(ChatMessage).where(
            ChatMessage.session_id == payload.session_id,
            ChatMessage.turno == payload.turno,
            ChatMessage.role == payload.role,
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        return {"status": "duplicate"}
    db.add(ChatMessage(
        session_id=payload.session_id,
        dev=payload.dev,
        projeto=payload.projeto,
        turno=payload.turno,
        role=payload.role,
        texto=payload.texto[:3000],
        ts=ts,
    ))
    await db.commit()
    return {"status": "ok"}


@router.get("/mensagens")
async def get_mensagens(dev: str | None = None, limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Retorna prompts agrupados por dev e sessão."""
    q = select(ChatMessage).order_by(ChatMessage.ts.desc()).limit(min(limit, 500))
    if dev:
        q = q.where(ChatMessage.dev == dev)
    result = await db.execute(q)
    msgs = result.scalars().all()

    # Agrupar por dev → session_id → lista de mensagens
    from collections import defaultdict
    devs: dict[str, dict] = {}
    for m in reversed(msgs):  # cronológico
        if m.dev not in devs:
            devs[m.dev] = {"dev": m.dev, "sessoes": {}}
        sid = m.session_id or f"{m.dev}_{m.ts.strftime('%Y%m%d')}"
        if sid not in devs[m.dev]["sessoes"]:
            devs[m.dev]["sessoes"][sid] = {
                "session_id": sid,
                "projeto": m.projeto,
                "inicio": m.ts.isoformat(),
                "fim": m.ts.isoformat(),
                "mensagens": [],
            }
        sess = devs[m.dev]["sessoes"][sid]
        sess["fim"] = m.ts.isoformat()
        sess["mensagens"].append({
            "turno": m.turno,
            "role": m.role,
            "texto": m.texto,
            "ts": m.ts.isoformat(),
        })

    return [
        {
            "dev": d["dev"],
            "total": sum(len(s["mensagens"]) for s in d["sessoes"].values()),
            "sessoes": sorted(d["sessoes"].values(), key=lambda s: s["fim"], reverse=True),
        }
        for d in sorted(devs.values(), key=lambda x: x["dev"])
    ]


@router.get("/sessoes-chat")
async def get_sessoes_chat(
    dev: str | None = None,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Lista sessões de chat paginadas, com metadata (sem mensagens)."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    # Sessões sem session_id são agrupadas por (dev, dia) em chave sintética.
    session_key = func.coalesce(
        ChatMessage.session_id,
        ChatMessage.dev + "_" + func.to_char(ChatMessage.ts, "YYYYMMDD"),
    ).label("session_key")

    base = select(
        session_key,
        ChatMessage.dev.label("dev"),
        func.max(ChatMessage.projeto).label("projeto"),
        func.min(ChatMessage.ts).label("inicio"),
        func.max(ChatMessage.ts).label("fim"),
        func.count().label("total"),
    ).group_by(session_key, ChatMessage.dev)

    if dev:
        base = base.where(ChatMessage.dev == dev)

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(func.max(ChatMessage.ts).desc()).offset(offset).limit(limit)
        )
    ).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "sessoes": [
            {
                "session_id": r.session_key,
                "dev": r.dev,
                "projeto": r.projeto,
                "inicio": r.inicio.isoformat(),
                "fim": r.fim.isoformat(),
                "total": r.total,
            }
            for r in rows
        ],
    }


@router.get("/sessoes-chat/{session_id}/mensagens")
async def get_mensagens_sessao(session_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna todas as mensagens de uma sessão, em ordem cronológica."""
    # Chave sintética: <dev>_<YYYYMMDD> (quando session_id original era NULL)
    synthetic: tuple[str, datetime] | None = None
    if "_" in session_id:
        dev_part, _, date_part = session_id.rpartition("_")
        if dev_part and len(date_part) == 8 and date_part.isdigit():
            try:
                day = datetime.strptime(date_part, "%Y%m%d").replace(tzinfo=timezone.utc)
                synthetic = (dev_part, day)
            except ValueError:
                pass

    q = select(ChatMessage)
    if synthetic:
        dev_part, day = synthetic
        q = q.where(
            ChatMessage.session_id.is_(None),
            ChatMessage.dev == dev_part,
            ChatMessage.ts >= day,
            ChatMessage.ts < day + timedelta(days=1),
        )
    else:
        q = q.where(ChatMessage.session_id == session_id)

    q = q.order_by(ChatMessage.turno.asc(), ChatMessage.ts.asc())
    msgs = (await db.execute(q)).scalars().all()

    if not msgs:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    return {
        "session_id": session_id,
        "dev": msgs[0].dev,
        "projeto": msgs[0].projeto,
        "inicio": min(m.ts for m in msgs).isoformat(),
        "fim": max(m.ts for m in msgs).isoformat(),
        "total": len(msgs),
        "mensagens": [
            {"turno": m.turno, "role": m.role, "texto": m.texto, "ts": m.ts.isoformat()}
            for m in msgs
        ],
    }


# ── F2/F3: Sinais ──────────────────────────────────────────────────────────────

@router.post("/sinal")
async def registrar_sinal(payload: SinalPayload, db: AsyncSession = Depends(get_db)):
    """Registra um sinal de atividade (erro, edição, skill) e publica no event bus."""
    ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
    isolated_owner = await get_isolated_owner(payload.dev, db)
    signal = DevSignal(
        tipo=payload.tipo,
        dev=payload.dev,
        projeto=payload.projeto,
        dados=payload.dados,
        ts=ts,
        isolated_owner=isolated_owner,
    )
    db.add(signal)
    await db.flush()  # popula signal.id

    await _event_bus.publish_event(
        db,
        type=f"signal.{payload.tipo}",
        actor=payload.dev,
        projeto=payload.projeto,
        payload=payload.dados or {},
        source_table="dev_signals",
        source_id=signal.id,
        ts=ts,
    )

    await db.commit()
    return {"status": "ok", "id": str(signal.id)}


# ── F2: Padrões de erro ────────────────────────────────────────────────────────

@router.get("/projeto/{projeto}/padroes")
async def get_padroes(projeto: str, dias: int = 7, min_ocorrencias: int = 3, db: AsyncSession = Depends(get_db)):
    """Retorna padrões de erro recorrentes no projeto (últimos N dias)."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    result = await db.execute(
        select(DevSignal).where(
            DevSignal.projeto == projeto,
            DevSignal.tipo == "erro_bash",
            DevSignal.ts >= desde,
            DevSignal.isolated_owner.is_(None),
        ).limit(5000)
    )
    sinais = result.scalars().all()

    contagens: dict[str, int] = defaultdict(int)
    for s in sinais:
        cmd_b64 = s.dados.get("cmd", "")
        try:
            cmd = base64.b64decode(cmd_b64).decode("utf-8", errors="replace").strip().split()[0].split("/")[-1]
        except Exception:
            cmd = "?"
        if cmd and cmd != "?":
            contagens[cmd] += 1

    padroes = [
        {"comando": cmd, "ocorrencias": n}
        for cmd, n in sorted(contagens.items(), key=lambda x: x[1], reverse=True)
        if n >= min_ocorrencias
    ]
    return {"projeto": projeto, "dias": dias, "padroes": padroes}


# ── F3: Afinidade dev × projeto ───────────────────────────────────────────────

@router.get("/projeto/{projeto}/afinidade")
async def get_afinidade_projeto(projeto: str, dias: int = 30, db: AsyncSession = Depends(get_db)):
    """Retorna ranking de afinidade dos devs com este projeto."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    result = await db.execute(
        select(DevSignal).where(
            DevSignal.projeto == projeto,
            DevSignal.tipo == "arquivo_editado",
            DevSignal.ts >= desde,
            DevSignal.isolated_owner.is_(None),
        ).limit(5000)
    )
    sinais = result.scalars().all()

    agora = datetime.now(timezone.utc)
    scores: dict[str, float] = defaultdict(float)
    ultimo: dict[str, datetime] = {}

    for s in sinais:
        semanas = (agora - s.ts).total_seconds() / (7 * 86400)
        peso = max(0.1, math.pow(0.9, semanas))
        op = s.dados.get("op", "edit")
        pts = 2.0 if op == "write" else 1.0
        scores[s.dev] += pts * peso
        if s.dev not in ultimo or s.ts > ultimo[s.dev]:
            ultimo[s.dev] = s.ts

    ranking = sorted(
        [{"dev": dev, "score": int(score), "ultimo_trabalho": ultimo[dev].date().isoformat()}
         for dev, score in scores.items()],
        key=lambda x: x["score"],
        reverse=True,
    )
    return {"projeto": projeto, "dias": dias, "ranking": ranking}


# ── SSH Identity ───────────────────────────────────────────────────────────────

class SSHIdentityPayload(BaseModel):
    ssh_ip: str
    ssh_port: str
    dev: str
    # Statsline — opcionais
    ctx_pct: int | None = None
    tokens_total: int | None = None
    turns: int | None = None
    model: str | None = None
    account_name: str | None = None
    plan: str | None = None
    projeto: str | None = None
    machine_hostname: str | None = None
    machine_ip: str | None = None


@router.post("/ssh/identity")
async def salvar_ssh_identity(payload: SSHIdentityPayload, db: AsyncSession = Depends(get_db)):
    """Salva (upsert) identidade dev para esta sessão SSH."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=45)

    result = await db.execute(
        select(SSHIdentity).where(
            SSHIdentity.ssh_ip == payload.ssh_ip,
            SSHIdentity.ssh_port == payload.ssh_port,
        )
    )
    existing = result.scalar_one_or_none()

    stats_fields = {
        "ctx_pct": payload.ctx_pct,
        "tokens_total": payload.tokens_total,
        "turns": payload.turns,
        "model": payload.model,
        "account_name": payload.account_name,
        "plan": payload.plan,
        "projeto": payload.projeto,
        "machine_hostname": payload.machine_hostname,
        "machine_ip": payload.machine_ip,
    }

    if existing:
        existing.dev = payload.dev
        existing.expires_at = expires_at
        for k, v in stats_fields.items():
            if v is not None:
                setattr(existing, k, v)
    else:
        db.add(SSHIdentity(
            ssh_ip=payload.ssh_ip,
            ssh_port=payload.ssh_port,
            dev=payload.dev,
            expires_at=expires_at,
            **{k: v for k, v in stats_fields.items() if v is not None},
        ))

    await db.commit()

    # Verificar se esta máquina tem update de skills pendente (via mcp_connections)
    update_skills = False
    machine = payload.machine_hostname or ""
    if machine:
        mc_result = await db.execute(select(MCPConnection).where(MCPConnection.machine == machine))
        mc = mc_result.scalar_one_or_none()
        if mc and mc.pending_skills_update:
            update_skills = True
            mc.pending_skills_update = False
            await db.commit()

    return {"status": "ok", "expires_at": expires_at.isoformat(), "update_skills": update_skills}


@router.get("/ssh/identities")
async def list_ssh_identities(db: AsyncSession = Depends(get_db)):
    """Lista devs ativos via SSH, agrupados por nome. Cada dev inclui lista de sessões individuais."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SSHIdentity)
        .where(SSHIdentity.expires_at > now)
        .order_by(SSHIdentity.expires_at.desc())
    )
    identities = result.scalars().all()

    grouped: dict[str, dict] = {}
    for i in identities:
        if i.dev not in grouped:
            grouped[i.dev] = {
                "dev": i.dev,
                "sessoes": 0,
                "expires_at": i.expires_at,
                "ssh_ip": i.ssh_ip,
                "machine_hostname": i.machine_hostname,
                "machine_ip": i.machine_ip,
                "ctx_pct": i.ctx_pct,
                "tokens_total": i.tokens_total,
                "turns": i.turns,
                "model": i.model,
                "account_name": i.account_name,
                "plan": i.plan,
                "sessions": [],
            }
        grouped[i.dev]["sessoes"] += 1
        if i.expires_at > grouped[i.dev]["expires_at"]:
            grouped[i.dev]["expires_at"] = i.expires_at
            grouped[i.dev]["ssh_ip"] = i.ssh_ip
            grouped[i.dev]["machine_hostname"] = i.machine_hostname
            grouped[i.dev]["ctx_pct"] = i.ctx_pct
            grouped[i.dev]["tokens_total"] = i.tokens_total
            grouped[i.dev]["turns"] = i.turns
            grouped[i.dev]["model"] = i.model
            grouped[i.dev]["account_name"] = i.account_name
            grouped[i.dev]["plan"] = i.plan
        grouped[i.dev]["sessions"].append({
            "ssh_ip": i.ssh_ip,
            "ssh_port": i.ssh_port,
            "machine_hostname": i.machine_hostname,
            "machine_ip": i.machine_ip,
            "expires_at": i.expires_at.isoformat(),
            "projeto": i.projeto,
            "ctx_pct": i.ctx_pct,
            "tokens_total": i.tokens_total,
            "turns": i.turns,
            "model": i.model,
            "account_name": i.account_name,
            "plan": i.plan,
            "updated_at": i.updated_at.isoformat() if i.updated_at else None,
        })

    return [
        {
            "dev": v["dev"],
            "sessoes": v["sessoes"],
            "ssh_ip": v["ssh_ip"],
            "machine_hostname": v.get("machine_hostname"),
            "machine_ip": v.get("machine_ip"),
            "expires_at": v["expires_at"].isoformat(),
            "ctx_pct": v["ctx_pct"],
            "tokens_total": v["tokens_total"],
            "turns": v["turns"],
            "model": v["model"],
            "account_name": v["account_name"],
            "plan": v["plan"],
            "sessions": v["sessions"],
        }
        for v in grouped.values()
    ]


@router.get("/ssh/identity")
async def get_ssh_identity(ip: str, port: str, db: AsyncSession = Depends(get_db)):
    """Retorna o dev identificado para esta sessão SSH (se não expirado)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SSHIdentity).where(
            SSHIdentity.ssh_ip == ip,
            SSHIdentity.ssh_port == port,
            SSHIdentity.expires_at > now,
        )
    )
    identity = result.scalar_one_or_none()
    if not identity:
        return {"dev": None}
    return {"dev": identity.dev, "expires_at": identity.expires_at.isoformat()}


# ── MCP Connections ────────────────────────────────────────────────────────────

class MCPConnectPayload(BaseModel):
    client_ip: str
    client_name: str = ""
    machine: str = ""
    hb_version: str = ""


@router.post("/mcp/update-trigger")
async def trigger_skills_update(machine: str, db: AsyncSession = Depends(get_db)):
    """Marca uma máquina para receber update de skills no próximo heartbeat. Persiste no banco."""
    result = await db.execute(select(MCPConnection).where(MCPConnection.machine == machine))
    conn = result.scalar_one_or_none()
    if conn:
        conn.pending_skills_update = True
        await db.commit()
        return {"status": "queued", "machine": machine}
    # Máquina ainda não registrada — guarda com flag
    db.add(MCPConnection(
        client_ip="pending",
        machine=machine,
        connected_at=datetime.now(timezone.utc),
        last_seen_at=datetime.now(timezone.utc),
        pending_skills_update=True,
    ))
    await db.commit()
    return {"status": "queued", "machine": machine}


@router.post("/mcp/skills-confirm")
async def confirm_skills_synced(machine: str, db: AsyncSession = Depends(get_db)):
    """Registra que a máquina concluiu o sync de skills."""
    await db.execute(
        update(MCPConnection)
        .where(MCPConnection.machine == machine)
        .values(skills_updated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/mcp/update-trigger/all")
async def trigger_skills_update_all(db: AsyncSession = Depends(get_db)):
    """Marca todas as máquinas conhecidas para receber update de skills no próximo heartbeat."""
    result = await db.execute(
        update(MCPConnection).values(pending_skills_update=True)
    )
    await db.commit()
    return {"status": "queued_all", "count": result.rowcount}


@router.post("/mcp/bootstrap-trigger")
async def trigger_bootstrap_update(machine: str, db: AsyncSession = Depends(get_db)):
    """Marca uma máquina para re-executar o bootstrap no próximo heartbeat."""
    result = await db.execute(select(MCPConnection).where(MCPConnection.machine == machine))
    conn = result.scalar_one_or_none()
    if conn:
        conn.pending_bootstrap_update = True
        await db.commit()
        return {"status": "queued", "machine": machine}
    db.add(MCPConnection(
        client_ip="pending",
        machine=machine,
        connected_at=datetime.now(timezone.utc),
        last_seen_at=datetime.now(timezone.utc),
        pending_bootstrap_update=True,
    ))
    await db.commit()
    return {"status": "queued", "machine": machine}


@router.post("/mcp/bootstrap-trigger/all")
async def trigger_bootstrap_update_all(db: AsyncSession = Depends(get_db)):
    """Marca todas as máquinas conhecidas para re-executar o bootstrap no próximo heartbeat."""
    result = await db.execute(
        update(MCPConnection).values(pending_bootstrap_update=True)
    )
    await db.commit()
    return {"status": "queued_all", "count": result.rowcount}


@router.post("/mcp/connect")
async def registrar_mcp_connection(payload: MCPConnectPayload, request: Request, db: AsyncSession = Depends(get_db)):
    """Registra ou atualiza uma conexão de cliente MCP."""
    real_ip = request.client.host if request.client else None
    result = await db.execute(
        select(MCPConnection).where(MCPConnection.client_ip == payload.client_ip)
    )
    existing = result.scalar_one_or_none()
    # Fallback: busca por machine name (bootstrap de máquinas com IP dinâmico)
    if not existing and payload.machine:
        result2 = await db.execute(
            select(MCPConnection).where(MCPConnection.machine == payload.machine)
        )
        existing = result2.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if existing:
        existing.last_seen_at = now
        existing.real_ip = real_ip
        if payload.client_name:
            existing.client_name = payload.client_name
        if payload.machine:
            existing.machine = payload.machine
        if payload.hb_version:
            existing.hb_version = payload.hb_version
        # Versão desatualizada → update_skills automático
        _cur = _current_hb_version()
        version_outdated = bool(
            payload.hb_version
            and _cur
            and payload.hb_version < _cur
        )
        was_pending = bool(existing.pending_skills_update)
        update_skills = was_pending or version_outdated
        if was_pending:
            existing.pending_skills_update = False
            existing.skills_updated_at = now
        update_bootstrap = bool(existing.pending_bootstrap_update)
        if update_bootstrap:
            existing.pending_bootstrap_update = False
            update_skills = True  # fallback: heartbeats antigos sem handler update_bootstrap recebem update_skills
    else:
        update_skills = False
        update_bootstrap = False
        db.add(MCPConnection(
            client_ip=payload.client_ip,
            client_name=payload.client_name or None,
            machine=payload.machine or None,
            real_ip=real_ip,
            hb_version=payload.hb_version or None,
            connected_at=now,
            last_seen_at=now,
        ))

    await db.commit()

    # Retorna task_progress ativas para propagação entre máquinas
    notif_result = await db.execute(
        select(Notification)
        .where(Notification.type == "task_progress", Notification.read == False)
        .order_by(Notification.created_at.desc())
        .limit(5)
    )
    task_notifications = [
        {
            "id": str(n.id),
            "message": n.message,
            "repo": n.repo,
            "tasks": (n.extra_data or {}).get("tasks", []),
        }
        for n in notif_result.scalars().all()
    ]

    # Memórias proativas: scope=session, scope_ref=machine, ainda não expiradas.
    # Geradas por agentes (conflict_detector, etc) — injetadas no contexto do prompt.
    machine_name = payload.machine or payload.client_name or ""
    pending_memories = []
    if machine_name:
        now_utc = datetime.now(timezone.utc)
        mem_result = await db.execute(
            select(Memory).where(
                Memory.scope == "session",
                Memory.scope_ref == machine_name,
                Memory.archived == False,  # noqa: E712
                or_(Memory.expires_at == None, Memory.expires_at > now_utc),  # noqa: E711
            ).order_by(Memory.created_at.desc()).limit(3)
        )
        pending_memories = [
            {
                "id": str(m.id),
                "type": m.type,
                "title": m.title,
                "content": m.content,
                "tags": m.tags or [],
                "confidence": m.confidence,
            }
            for m in mem_result.scalars().all()
        ]

    # Distribuir chave para máquinas já registradas (bootstrap seguro)
    # Só retorna para máquinas conhecidas (existing); novas precisam de onboarding manual
    hub_key = settings.hub_api_key if (existing and settings.hub_api_key) else None

    return {"status": "ok", "update_skills": update_skills,
            "update_bootstrap": update_bootstrap,
            "task_notifications": task_notifications,
            "pending_memories": pending_memories,
            **({"hub_api_key": hub_key} if hub_key else {})}


@router.get("/mcp/connections")
async def listar_mcp_connections(db: AsyncSession = Depends(get_db)):
    """Lista clientes MCP conectados (vistos nas últimas 24h)."""
    desde = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(MCPConnection)
        .where(MCPConnection.last_seen_at >= desde)
        .order_by(MCPConnection.last_seen_at.desc())
    )
    conns = result.scalars().all()
    agora = datetime.now(timezone.utc)
    return [
        {
            "client_ip": c.client_ip,
            "client_name": c.client_name,
            "machine": c.machine,
            "connected_at": c.connected_at.isoformat(),
            "last_seen_at": c.last_seen_at.isoformat(),
            "minutos_atras": int((agora - c.last_seen_at).total_seconds() / 60),
            "ativo": (agora - c.last_seen_at).total_seconds() < 2700,  # 45min
            "skills_updated_at": c.skills_updated_at.isoformat() if c.skills_updated_at else None,
            "skills_pending": c.pending_skills_update,
            "bootstrap_pending": c.pending_bootstrap_update,
            "real_ip": c.real_ip,
            "hb_version": c.hb_version,
            "hb_outdated": bool(c.hb_version and _current_hb_version() and c.hb_version < _current_hb_version()),
        }
        for c in conns
    ]


@router.get("/dev/{dev}/projeto/{projeto:path}/contexto")
async def get_dev_project_context(dev: str, projeto: str, db: AsyncSession = Depends(get_db)):
    """Último contexto salvo para este dev+projeto (slug owner/repo)."""
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.dev == dev, SessionContext.projeto == projeto)
        .order_by(SessionContext.timestamp.desc())
        .limit(1)
    )
    ctx = result.scalar_one_or_none()
    if not ctx:
        return {"found": False}
    agora = datetime.now(timezone.utc)
    minutos_atras = int((agora - ctx.timestamp).total_seconds() / 60)
    return {
        "found": True,
        "branch": ctx.branch,
        "arquivos": ctx.arquivos,
        "ultimo_commit": ctx.ultimo_commit,
        "timestamp": ctx.timestamp.isoformat(),
        "minutos_atras": minutos_atras,
    }


@router.get("/projeto/{projeto:path}/devs-ativos")
async def get_projeto_devs_ativos(projeto: str, db: AsyncSession = Depends(get_db)):
    """Devs com sessão SSHIdentity ativa (<2h) no projeto."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    result = await db.execute(
        select(SSHIdentity)
        .where(SSHIdentity.projeto == projeto, SSHIdentity.updated_at >= cutoff)
        .order_by(SSHIdentity.updated_at.desc())
    )
    devs = result.scalars().all()
    agora = datetime.now(timezone.utc)
    return [
        {
            "dev": d.dev,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "minutos_atras": int((agora - d.updated_at).total_seconds() / 60) if d.updated_at else None,
        }
        for d in devs
    ]


@router.get("/sinais")
async def listar_sinais(
    dev: str | None = None,
    projeto: str | None = None,
    tipo: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Lista DevSignals com filtros opcionais."""
    from sqlalchemy import and_
    conditions = []
    if dev:
        conditions.append(DevSignal.dev == dev)
    if projeto:
        conditions.append(DevSignal.projeto == projeto)
    if tipo:
        conditions.append(DevSignal.tipo == tipo)
    q = select(DevSignal).order_by(DevSignal.ts.desc()).limit(min(limit, 200))
    if conditions:
        q = q.where(and_(*conditions))
    result = await db.execute(q)
    sinais = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "tipo": s.tipo,
            "dev": s.dev,
            "projeto": s.projeto,
            "dados": s.dados,
            "ts": s.ts.isoformat(),
        }
        for s in sinais
    ]


@router.get("/padroes")
async def get_padroes_global(dias: int = 7, min_ocorrencias: int = 2, limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Padrões de erro globais (todos os projetos)."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    result = await db.execute(
        select(DevSignal).where(
            DevSignal.tipo == "erro_bash",
            DevSignal.ts >= desde,
            DevSignal.isolated_owner.is_(None),
        ).limit(10000)
    )
    sinais = result.scalars().all()

    contagens: dict[tuple, int] = defaultdict(int)
    for s in sinais:
        cmd_b64 = s.dados.get("cmd", "")
        try:
            cmd = base64.b64decode(cmd_b64).decode("utf-8", errors="replace").strip().split()[0].split("/")[-1]
        except Exception:
            cmd = "?"
        if cmd and cmd != "?":
            contagens[(s.projeto, cmd)] += 1

    padroes = [
        {"projeto": proj, "comando": cmd, "ocorrencias": n}
        for (proj, cmd), n in sorted(contagens.items(), key=lambda x: x[1], reverse=True)
        if n >= min_ocorrencias
    ][:limit]
    return {"dias": dias, "padroes": padroes}


@router.get("/digest/hoje")
async def get_digest_hoje(db: AsyncSession = Depends(get_db)):
    """Digest do dia: sessões, commits e sinais agrupados por dev."""
    agora = datetime.now(timezone.utc)
    desde = agora.replace(hour=0, minute=0, second=0, microsecond=0)

    sessoes_res = await db.execute(
        select(SessionContext).where(SessionContext.timestamp >= desde)
    )
    sessoes = sessoes_res.scalars().all()

    sinais_res = await db.execute(
        select(DevSignal).where(DevSignal.ts >= desde)
    )
    sinais = sinais_res.scalars().all()

    por_dev: dict[str, dict] = {}

    for s in sessoes:
        dev = s.dev
        if dev not in por_dev:
            por_dev[dev] = {"projetos": set(), "commits": [], "sessoes": 0, "edits": 0, "errors": 0}
        por_dev[dev]["projetos"].add(s.projeto.split("/")[-1])
        if s.ultimo_commit:
            msg = s.ultimo_commit.split("(")[0].strip()
            if msg:
                por_dev[dev]["commits"].append(msg)
        por_dev[dev]["sessoes"] += 1

    for s in sinais:
        dev = s.dev
        if dev not in por_dev:
            por_dev[dev] = {"projetos": set(), "commits": [], "sessoes": 0, "edits": 0, "errors": 0}
        if s.tipo == "arquivo_editado":
            por_dev[dev]["edits"] += 1
        elif s.tipo == "erro_bash":
            por_dev[dev]["errors"] += 1
        elif s.tipo == "commit_realizado":
            msg = s.dados.get("msg", "")
            if msg and msg not in por_dev[dev]["commits"]:
                por_dev[dev]["commits"].append(msg)

    return {
        "data": agora.strftime("%d/%m/%Y"),
        "total_sessoes": len(sessoes),
        "total_sinais": len(sinais),
        "devs": [
            {
                "dev": dev,
                "projetos": sorted(dados["projetos"]),
                "commits": list(dict.fromkeys(dados["commits"]))[:5],
                "sessoes": dados["sessoes"],
                "edits": dados["edits"],
                "errors": dados["errors"],
            }
            for dev, dados in sorted(por_dev.items())
        ],
    }


@router.get("/scorecard")
async def get_scorecard(dias: int = 7, db: AsyncSession = Depends(get_db)):
    """Scorecard semanal por dev: commits, edições, erros, sessões."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)

    sinais_res = await db.execute(
        select(DevSignal).where(DevSignal.ts >= desde, DevSignal.isolated_owner.is_(None)).limit(10000)
    )
    sinais = sinais_res.scalars().all()

    sessoes_res = await db.execute(
        select(SessionContext).where(
            SessionContext.timestamp >= desde,
            SessionContext.isolated_owner.is_(None),
        ).limit(5000)
    )
    sessoes = sessoes_res.scalars().all()

    por_dev: dict[str, dict] = {}

    for s in sinais:
        dev = s.dev
        if dev not in por_dev:
            por_dev[dev] = {"commits": 0, "edits": 0, "errors": 0, "skills": 0, "projetos": set()}
        if s.tipo == "commit_realizado":
            por_dev[dev]["commits"] += 1
        elif s.tipo == "arquivo_editado":
            por_dev[dev]["edits"] += 1
        elif s.tipo == "erro_bash":
            por_dev[dev]["errors"] += 1
        elif s.tipo == "skill_usada":
            por_dev[dev]["skills"] += 1
        por_dev[dev]["projetos"].add(s.projeto.split("/")[-1])

    sessoes_por_dev: dict[str, int] = defaultdict(int)
    for s in sessoes:
        sessoes_por_dev[s.dev] += 1

    resultado = []
    todos_devs = set(por_dev.keys()) | set(sessoes_por_dev.keys())
    for dev in sorted(todos_devs):
        d = por_dev.get(dev, {"commits": 0, "edits": 0, "errors": 0, "skills": 0, "projetos": set()})
        resultado.append({
            "dev": dev,
            "commits": d["commits"],
            "edits": d["edits"],
            "errors": d["errors"],
            "skills": d["skills"],
            "sessoes": sessoes_por_dev.get(dev, 0),
            "projetos": sorted(d["projetos"]),
            "score": d["commits"] * 5 + d["edits"] + d["skills"] * 2,
        })
    resultado.sort(key=lambda x: x["score"], reverse=True)
    return {"dias": dias, "devs": resultado}


@router.get("/conflitos")
async def get_conflitos(horas: int = 24, db: AsyncSession = Depends(get_db)):
    """Detecta arquivos editados por 2+ devs sem commit entre eles."""
    desde = datetime.now(timezone.utc) - timedelta(hours=horas)

    result = await db.execute(
        select(DevSignal).where(
            DevSignal.tipo.in_(["arquivo_editado", "commit_realizado"]),
            DevSignal.ts >= desde,
        ).order_by(DevSignal.ts.asc()).limit(10000)
    )
    sinais = result.scalars().all()

    # Para cada (projeto, arquivo): rastrear quais devs editaram sem commit depois
    # arquivo_editado → marca dev como "sujo" naquele arquivo
    # commit_realizado → limpa o dev naquele projeto
    arquivos: dict[str, dict[str, str]] = {}   # key → {dev: ts}
    diffs_por_key: dict[str, dict[str, str]] = {}  # key → {dev: diff}
    commits_por_dev: dict[str, str] = {}

    for s in sinais:
        if s.tipo == "commit_realizado":
            commits_por_dev[s.dev] = s.ts.isoformat()
        elif s.tipo == "arquivo_editado":
            arq = s.dados.get("arquivo", "")
            if not arq:
                continue
            key = f"{s.projeto}||{arq}"
            if key not in arquivos:
                arquivos[key] = {}
                diffs_por_key[key] = {}
            ultimo_commit = commits_por_dev.get(s.dev, "")
            if not ultimo_commit or ultimo_commit < s.ts.isoformat():
                arquivos[key][s.dev] = s.ts.isoformat()
                diff = s.dados.get("diff", "")
                if diff:
                    diffs_por_key[key][s.dev] = diff
            else:
                arquivos[key].pop(s.dev, None)
                diffs_por_key[key].pop(s.dev, None)

    conflitos = []
    for key, devs_map in arquivos.items():
        if len(devs_map) >= 2:
            proj, arq = key.split("||", 1)
            conflitos.append({
                "projeto": proj,
                "arquivo": arq,
                "devs": list(devs_map.keys()),
                "ultima_edicao": max(devs_map.values()),
                "diffs": diffs_por_key.get(key, {}),
            })

    conflitos.sort(key=lambda x: x["ultima_edicao"], reverse=True)
    return {"horas": horas, "conflitos": conflitos[:20]}


@router.get("/projetos/abandono")
async def get_projetos_abandono(dias_inativo: int = 3, min_uncommitted: int = 3, db: AsyncSession = Depends(get_db)):
    """Projetos com arquivos não commitados e sem atividade recente."""
    import json as _json
    import tempfile as _tmp

    # Ler status do git monitor
    status_file = os.path.join(_tmp.gettempdir(), "cerebro_project_status.json")
    git_status: dict = {}
    try:
        git_status = _json.loads(open(status_file).read())
    except Exception:
        pass

    cutoff = datetime.now(timezone.utc) - timedelta(days=dias_inativo)
    sessoes_res = await db.execute(
        select(SessionContext).where(SessionContext.timestamp >= cutoff)
    )
    projetos_ativos = {s.projeto for s in sessoes_res.scalars().all()}

    abandono = []
    for slug, info in git_status.items():
        uncommitted = info.get("uncommitted_count", 0)
        if uncommitted < min_uncommitted:
            continue
        if "/" not in slug:  # pular sem remote
            continue
        if slug in projetos_ativos:
            continue

        # Calcular dias sem atividade
        scanned_at = info.get("scanned_at", "")
        ultimo_commit = info.get("ultimo_commit", "")

        abandono.append({
            "projeto": slug,
            "nome": slug.split("/")[-1],
            "uncommitted": uncommitted,
            "branch": info.get("branch", ""),
            "ultimo_commit": ultimo_commit,
        })

    abandono.sort(key=lambda x: x["uncommitted"], reverse=True)
    return {"dias_inativo": dias_inativo, "projetos": abandono[:10]}


@router.get("/afinidade")
async def get_afinidade_geral(dias: int = 30, db: AsyncSession = Depends(get_db)):
    """Retorna tabela completa de afinidade dev × projeto."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    result = await db.execute(
        select(DevSignal).where(
            DevSignal.tipo == "arquivo_editado",
            DevSignal.ts >= desde,
            DevSignal.isolated_owner.is_(None),
        ).limit(10000)
    )
    sinais = result.scalars().all()

    agora = datetime.now(timezone.utc)
    scores: dict[tuple, float] = defaultdict(float)

    for s in sinais:
        semanas = (agora - s.ts).total_seconds() / (7 * 86400)
        peso = max(0.1, math.pow(0.9, semanas))
        op = s.dados.get("op", "edit")
        pts = 2.0 if op == "write" else 1.0
        scores[(s.dev, s.projeto)] += pts * peso

    tabela = sorted(
        [{"dev": dev, "projeto": proj, "score": int(score)}
         for (dev, proj), score in scores.items()],
        key=lambda x: x["score"],
        reverse=True,
    )
    return {"dias": dias, "tabela": tabela}


# ── LocalDev Management ────────────────────────────────────────────────────────

class LocalDevCreate(BaseModel):
    name: str
    display_name: str | None = None
    project_scope: list[str] = []
    isolated: bool = False
    github_link: str | None = None



@router.post("/devs/register", dependencies=[Depends(require_admin)])
async def registrar_dev_local(payload: LocalDevCreate, db: AsyncSession = Depends(get_db)):
    """Registra um novo dev local (sem GitHub OAuth). Retorna o token gerado — guarde-o."""
    existing = await db.execute(select(LocalDev).where(LocalDev.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Dev '{payload.name}' já existe")

    token = secrets.token_urlsafe(32)
    token_hash = hmac.new(settings.secret_key.encode(), token.encode(), "sha256").hexdigest()

    db.add(LocalDev(
        name=payload.name,
        display_name=payload.display_name,
        token_hash=token_hash,
        project_scope=payload.project_scope,
        isolated=payload.isolated,
        github_link=payload.github_link,
    ))
    await db.commit()
    return {
        "status": "created",
        "dev": payload.name,
        "isolated": payload.isolated,
        "token": token,  # único momento em que o token é retornado em plaintext
    }


@router.get("/devs", dependencies=[Depends(require_admin)])
async def listar_devs_locais(db: AsyncSession = Depends(get_db)):
    """Lista todos os devs locais registrados."""
    result = await db.execute(select(LocalDev).order_by(LocalDev.created_at))
    devs = result.scalars().all()
    return [
        {
            "name": d.name,
            "display_name": d.display_name,
            "project_scope": d.project_scope,
            "isolated": d.isolated,
            "github_link": d.github_link,
            "created_at": d.created_at.isoformat(),
        }
        for d in devs
    ]


@router.post("/devs/{dev}/token", dependencies=[Depends(require_admin)])
async def rotacionar_token_dev(dev: str, db: AsyncSession = Depends(get_db)):
    """Gera novo token para o dev local (invalida o anterior)."""
    result = await db.execute(select(LocalDev).where(LocalDev.name == dev))
    ld = result.scalar_one_or_none()
    if not ld:
        raise HTTPException(status_code=404, detail=f"Dev '{dev}' não encontrado")

    token = secrets.token_urlsafe(32)
    ld.token_hash = hmac.new(settings.secret_key.encode(), token.encode(), "sha256").hexdigest()
    await db.commit()
    return {"status": "rotated", "dev": dev, "token": token}


@router.post("/devs/auth")
async def autenticar_dev_local(dev: str, token: str, db: AsyncSession = Depends(get_db)):
    """Valida token de um LocalDev. Usado pelo sbh-auth para vincular sessão."""
    result = await db.execute(select(LocalDev).where(LocalDev.name == dev))
    ld = result.scalar_one_or_none()
    if not ld:
        raise HTTPException(status_code=401, detail="Dev não encontrado")
    token_hash = hmac.new(settings.secret_key.encode(), token.encode(), "sha256").hexdigest()
    if not secrets.compare_digest(token_hash, ld.token_hash):
        raise HTTPException(status_code=401, detail="Token inválido")
    return {
        "dev": ld.name,
        "display_name": ld.display_name,
        "isolated": ld.isolated,
        "project_scope": ld.project_scope,
    }


@router.get("/bootstrap", response_class=__import__('fastapi').responses.PlainTextResponse)
async def get_bootstrap_script():
    """Retorna script Python universal para bootstrap de autenticação em qualquer máquina/OS."""
    hub_bases = [
        b for b in [settings.hub_base_url, "http://hub.fluxiom.com.br:8010", "http://187.77.241.157:8010"]
        if b
    ]
    pub_key_b64 = "yKiI3G8Ux7K7TYCv4VLA7RPKfoEOlCjK063snx/0o5E="
    script = f'''#!/usr/bin/env python3
"""Bootstrap hub — instala chave + heartbeat atualizado. Funciona em Linux, Mac e Windows."""
import os, json, socket, pathlib, base64
import urllib.request as _ur

HUB_BASES  = {hub_bases!r}
HUB_PUBKEY = "{pub_key_b64}"
HOME       = pathlib.Path.home()
CLAUDE     = HOME / ".claude"
HOOKS      = CLAUDE / "hooks"


def _verify_signature(content, signature_b64):
    """Verifica assinatura ed25519. Retorna True se válida ou se cryptography não disponível."""
    if not signature_b64:
        return True  # hub sem assinatura = versão antiga, aceita
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(HUB_PUBKEY))
        pub.verify(base64.b64decode(signature_b64), content.encode("utf-8"))
        return True
    except ImportError:
        return True  # sem lib, pula verificação
    except Exception:
        return False


def _post(path, data):
    for base in HUB_BASES:
        try:
            req = _ur.Request(f"{{base}}{{path}}", data=data, method="POST")
            req.add_header("Content-Type", "application/json")
            with _ur.urlopen(req, timeout=5) as r:
                return json.loads(r.read())
        except Exception:
            pass
    return None


def _get(path, key=""):
    for base in HUB_BASES:
        try:
            req = _ur.Request(f"{{base}}{{path}}")
            if key:
                req.add_header("X-Hub-Key", key)
            with _ur.urlopen(req, timeout=5) as r:
                return json.loads(r.read())
        except Exception:
            pass
    return None


print("\\n=== Bootstrap Hub ===\\n")

# 1. Conectar e obter chave
machine = socket.gethostname()

# Detecção de IP: SSH_CONNECTION > interface de rede > fallback
ip = "127.0.0.1"
ssh_conn = os.environ.get("SSH_CONNECTION", "").strip()
if ssh_conn and len(ssh_conn.split()) >= 3:
    ip = ssh_conn.split()[2]
else:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

resp = _post("/api/cerebro/mcp/connect", json.dumps({{
    "client_ip": ip, "client_name": f"bootstrap/{{machine}}", "machine": machine
}}).encode())

if not resp:
    print("ERRO: não foi possível conectar ao hub")
    raise SystemExit(1)

hub_key = resp.get("hub_api_key", "")
if not hub_key:
    # Primeira chamada registra a maquina; segunda ja retorna a chave
    resp2 = _post("/api/cerebro/mcp/connect", json.dumps({{
        "client_ip": ip, "client_name": f"bootstrap/{{machine}}", "machine": machine
    }}).encode())
    hub_key = (resp2 or {{}}).get("hub_api_key", "")
if not hub_key:
    print("ERRO: maquina nao registrada no hub — contate o administrador")
    raise SystemExit(1)

# 2. Salvar chave
CLAUDE.mkdir(exist_ok=True)
key_file = CLAUDE / "hub_api_key"
key_file.write_text(hub_key, encoding='utf-8')
try:
    key_file.chmod(0o600)
except Exception:
    pass
print(f"OK  chave salva -> {{key_file}}")

# 3. Baixar e instalar todos os hooks criticos
HOOKS.mkdir(exist_ok=True)

_files = [
    ("prompt_mcp_heartbeat.py", HOOKS / "prompt_mcp_heartbeat.py",   True),
    ("_http.py",                HOOKS / "_http.py",                   True),
    ("cerebro_loader.py",       CLAUDE / "cerebro_loader.py",         False),
    ("stop_skills_sync.py",     HOOKS / "stop_skills_sync.py",        False),
    ("_skills_daemon.py",       HOOKS / "_skills_daemon.py",          False),
]

# Também atualiza ~/skills/hooks/ para evitar downgrade pelo self-update do HB
SKILLS_HOOKS = HOME / "skills" / "hooks"

for fname, dest, required in _files:
    d = _get(f"/api/cerebro/hooks/{{fname}}", hub_key)
    if not d or not d.get("content"):
        if required:
            print(f"ERRO: nao foi possivel baixar {{fname}}")
            raise SystemExit(1)
        continue
    content = d["content"]
    if not _verify_signature(content, d.get("signature", "")):
        print(f"ERRO: assinatura invalida para {{fname}} — possivel adulteracao")
        raise SystemExit(1)
    dest.write_text(content, encoding='utf-8')
    try:
        dest.chmod(0o755)
    except Exception:
        pass
    # Espelha em ~/skills/hooks/ se existir (evita self-update sobrescrever)
    if fname.endswith(".py") and fname != "cerebro_loader.py" and SKILLS_HOOKS.is_dir():
        try:
            (SKILLS_HOOKS / fname).write_text(content, encoding='utf-8')
        except Exception:
            pass
    _ver = ""
    if fname == "prompt_mcp_heartbeat.py":
        import re as _re
        _m = _re.search(r"""HB_VERSION\s*=\s*["']([^"']+)["']""", content)
        _ver = f"  (HB {{_m.group(1)}})" if _m else ""
    print(f"OK  {{fname}} -> {{dest}}{{_ver}}")

# 4. Criar .noupdate — protege hooks críticos contra self-update do ~/skills/
_noupdate = HOOKS / ".noupdate"
_protected_hooks = [
    "prompt_mcp_heartbeat.py",
    "_http.py",
    "stop_skills_sync.py",
    "_skills_daemon.py",
]
try:
    existing = set()
    if _noupdate.exists():
        existing = {{l.strip() for l in _noupdate.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")}}
    missing = [h for h in _protected_hooks if h not in existing]
    if missing:
        with _noupdate.open("a", encoding="utf-8") as f:
            if not existing:
                f.write("# hooks gerenciados pelo hub — nao sobrescrever via self-update do ~/skills\\n")
            for h in missing:
                f.write(h + "\\n")
        print(f"OK  .noupdate criado/atualizado ({{len(_protected_hooks)}} hooks protegidos)")
    else:
        print("OK  .noupdate ja configurado")
except Exception as e:
    print(f"WARN .noupdate nao criado: {{e}}")

# 5. Registrar heartbeat no settings.json
_sp = CLAUDE / "settings.json"
try:
    import json as _j
    _s = _j.loads(_sp.read_text(encoding="utf-8")) if _sp.exists() else {{}}
except Exception:
    _s = {{}}
# forward slashes — bash do Git Bash come backslashes em paths Windows
# python explicito — shebang #!/usr/bin/env python3 falha no Windows (so tem 'python')
import sys as _sys2
_hb_path = (HOOKS / "prompt_mcp_heartbeat.py").as_posix()
_python = "python" if _sys2.platform == "win32" else "python3"
_hb_cmd = _python + ' "' + _hb_path + '"'
_ups = _s.setdefault("hooks", {{}}).setdefault("UserPromptSubmit", [])
# remove entradas antigas (paths nus, backslashes, python3 no Windows) — cleanup idempotente
for _e in _ups:
    _e["hooks"] = [_h for _h in _e.get("hooks", [])
                   if "prompt_mcp_heartbeat.py" not in _h.get("command", "")
                   or _h.get("command", "") == _hb_cmd]
_ups[:] = [_e for _e in _ups if _e.get("hooks")]
_already = any(h.get("command", "") == _hb_cmd for e in _ups for h in e.get("hooks", []))
if not _already:
    _ups.append({{"hooks": [{{"type": "command", "command": _hb_cmd}}]}})
    _sp.write_text(_j.dumps(_s, indent=2, ensure_ascii=False), encoding="utf-8")
    print("OK  heartbeat registrado em settings.json")
else:
    print("OK  heartbeat ja registrado em settings.json")

# 6. Instalar cron/Task Scheduler — heartbeat a cada 5min independente do Claude
import sys as _sys, subprocess as _sp2
_hb_py = str(HOOKS / "prompt_mcp_heartbeat.py")

if _sys.platform == "win32":
    # Windows — Task Scheduler via schtasks
    try:
        _task = "ClaudeHubHeartbeat"
        _tr = "python " + chr(34) + _hb_py + chr(34)
        _sp2.run(["schtasks", "/delete", "/tn", _task, "/f"], capture_output=True)
        _sp2.run([
            "schtasks", "/create", "/tn", _task,
            "/tr", _tr,
            "/sc", "minute", "/mo", "5",
            "/f",
        ], check=True, capture_output=True)
        print("OK  Task Scheduler configurado (a cada 5min)")
    except Exception as _e:
        print("WARN Task Scheduler nao configurado: " + str(_e))
else:
    # Linux / macOS — crontab
    try:
        _entry = "*/5 * * * * python3 " + _hb_py + " >> /tmp/hb_cron.log 2>&1"
        _existing = _sp2.run(["crontab", "-l"], capture_output=True, text=True).stdout
        if _hb_py not in _existing:
            _new = (_existing.rstrip("\\n") + "\\n" + _entry + "\\n").lstrip("\\n")
            _sp2.run(["crontab", "-"], input=_new, text=True, check=True)
            print("OK  cron instalado (a cada 5min)")
        else:
            print("OK  cron ja instalado")
    except Exception as _e:
        print("WARN cron nao instalado: " + str(_e))

# 7. Confirmar versão instalada ao hub
try:
    import re as _re2
    _hb_file = HOOKS / "prompt_mcp_heartbeat.py"
    _hb_ver = ""
    if _hb_file.exists():
        for _line in _hb_file.read_text(encoding="utf-8").splitlines():
            if _line.startswith("HB_VERSION"):
                _hb_ver = _line.split("=")[1].strip().strip("\\"\\'")
                break
    if _hb_ver:
        _post("/api/cerebro/mcp/connect", json.dumps({{
            "client_ip": ip, "client_name": f"bootstrap/{{machine}}", "machine": machine,
            "hb_version": _hb_ver,
        }}).encode())
        print(f"OK  hub notificado — HB instalado: {{_hb_ver}}")
except Exception as _e:
    print("WARN nao foi possivel notificar hub: " + str(_e))

print("\\nBOOTSTRAP CONCLUIDO — proximo prompt ja sera autenticado\\n")
'''
    return script


def _sign_content(content: str) -> str:
    """Assina content com ed25519. Retorna base64 da assinatura, ou '' se chave indisponível."""
    try:
        import base64
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        key_path = settings.hub_signing_key_path
        if not os.path.exists(key_path):
            return ""
        pem = open(key_path, "rb").read()
        private_key: Ed25519PrivateKey = load_pem_private_key(pem, password=None)
        sig = private_key.sign(content.encode("utf-8"))
        return base64.b64encode(sig).decode()
    except Exception:
        return ""


def _current_hb_version() -> str:
    """Lê HB_VERSION direto do arquivo fonte — nunca desincroniza com o que é servido."""
    import re
    try:
        content = open(os.path.expanduser("~/skills/hooks/prompt_mcp_heartbeat.py"), encoding="utf-8").read()
        m = re.search(r'^HB_VERSION\s*=\s*["\']([^"\']+)["\']', content, re.M)
        return m.group(1) if m else ""
    except Exception:
        return settings.current_hb_version  # fallback


@router.get("/hooks/{filename}")
async def get_hook_file(filename: str):
    """Serve hooks críticos para auto-update sem depender de git."""
    import hashlib
    allowed = {"_http.py": "~/skills/hooks/_http.py",
               "cerebro_loader.py": "~/skills/cerebro_loader.py",
               "prompt_mcp_heartbeat.py": "~/skills/hooks/prompt_mcp_heartbeat.py",
               "stop_skills_sync.py": "~/skills/hooks/stop_skills_sync.py",
               "_skills_daemon.py": "~/skills/hooks/_skills_daemon.py"}
    if filename not in allowed:
        raise HTTPException(status_code=404, detail="Arquivo não disponível")
    try:
        content = open(os.path.expanduser(allowed[filename])).read()
        signature = _sign_content(content)
        return {
            "content": content,
            "hash": hashlib.sha256(content.encode()).hexdigest()[:16],
            "filename": filename,
            "signature": signature,
        }
    except Exception:
        raise HTTPException(status_code=404, detail=f"{filename} não disponível")


@router.get("/skills/sync")
async def skills_sync(since: str = Query("", description="Commit atual do cliente — retorna up_to_date=true se nada mudou")):
    """Atualiza o clone local do repo skills e retorna arquivos alterados como JSON.
    Mantém o GitHub token centralizado no hub — clientes usam apenas X-Hub-Key."""
    import subprocess, hashlib
    from pathlib import Path as _Path

    skills_dir = _Path(os.getenv("REPOS_DIR", "/data/repos")) / "dioliveira07_skills"
    if not skills_dir.exists():
        raise HTTPException(status_code=404, detail="Skills repo não encontrado no hub")

    # git pull no clone local (token já está na remote URL do clone)
    subprocess.run(
        ["git", "-C", str(skills_dir), "pull", "--rebase", "-q"],
        capture_output=True, timeout=30,
    )

    # commit atual
    r = subprocess.run(["git", "-C", str(skills_dir), "rev-parse", "HEAD"],
                       capture_output=True, text=True)
    commit = r.stdout.strip()

    if since and since == commit:
        return {"up_to_date": True, "commit": commit}

    # coleta arquivos texto (exclui binários, __pycache__, .git)
    allowed_ext = {".md", ".py", ".sh", ".ps1", ".json", ".yaml", ".yml", ".txt", ".html"}
    files: dict[str, str] = {}
    for f in skills_dir.rglob("*"):
        if not f.is_file():
            continue
        parts = f.parts
        if any(p in (".git", "__pycache__") for p in parts):
            continue
        if f.suffix not in allowed_ext:
            continue
        if f.stat().st_size > 512_000:  # pula arquivos > 512KB
            continue
        try:
            files[str(f.relative_to(skills_dir))] = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass

    return {
        "up_to_date": False,
        "commit": commit,
        "file_count": len(files),
        "files": files,
    }


# ── Memória causal proativa — Foundation v2 ─────────────────────────────────

# TTL por tipo de memória (None = permanente).
MEMORY_TTL = {
    "progress": timedelta(days=30),     # decay 7d half-life mas só apaga em 30d
    "context":  timedelta(days=90),     # decay 30d half-life mas só apaga em 90d
    "session":  timedelta(hours=24),    # gotchas de sessão
    "architectural_decision": None,
    "gotcha":   None,
    "pattern":  None,
    "personal": None,
}


class MemoryCreatePayload(BaseModel):
    type: str
    scope: str = "global"
    scope_ref: str | None = None
    title: str
    content: str
    tags: list[str] = []
    confidence: float = 1.0
    source_type: str | None = None
    source_ref: str | None = None
    expires_at: datetime | None = None  # se None, deriva do tipo


class MemoryUpdatePayload(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    confidence: float | None = None
    archived: bool | None = None


@router.post("/memory")
async def criar_memory(payload: MemoryCreatePayload, db: AsyncSession = Depends(get_db)):
    """Cria uma memória. expires_at é inferido do tipo se não fornecido."""
    expires_at = payload.expires_at
    if expires_at is None:
        ttl = MEMORY_TTL.get(payload.type)
        if ttl:
            expires_at = datetime.now(timezone.utc) + ttl

    mem = Memory(
        type=payload.type,
        scope=payload.scope,
        scope_ref=payload.scope_ref,
        title=payload.title,
        content=payload.content,
        tags=payload.tags,
        confidence=payload.confidence,
        source_type=payload.source_type,
        source_ref=payload.source_ref,
        expires_at=expires_at,
    )
    db.add(mem)
    await db.flush()

    # Indexa no Qdrant para busca semântica futura
    try:
        await asyncio.to_thread(_memory_qdrant.index_memory, mem)
    except Exception:
        pass  # falha silenciosa — DB é authoritative

    await _event_bus.publish_event(
        db,
        type="memory.created",
        actor="system",
        projeto=payload.scope_ref if payload.scope == "project" else None,
        payload={"memory_id": str(mem.id), "type": payload.type, "title": payload.title[:200]},
        source_table="memories",
        source_id=mem.id,
    )
    await db.commit()
    return _memory_to_dict(mem)


@router.get("/memory")
async def listar_memories(
    type: str | None = None,
    scope: str | None = None,
    scope_ref: str | None = None,
    projeto: str | None = None,  # alias para scope_ref quando scope=project
    tag: str | None = None,
    archived: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Lista memórias com filtros."""
    q = select(Memory).where(Memory.archived == archived)
    if type:
        q = q.where(Memory.type == type)
    if scope:
        q = q.where(Memory.scope == scope)
    ref = scope_ref or projeto
    if ref:
        q = q.where(Memory.scope_ref == ref)
    if tag:
        # JSONB contains array element
        q = q.where(Memory.tags.op("@>")([tag]))
    q = q.order_by(Memory.confidence.desc(), Memory.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return [_memory_to_dict(m) for m in result.scalars().all()]


@router.get("/memory/{memory_id}")
async def get_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Busca uma memória por ID e incrementa access_count."""
    try:
        mid = uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido")
    result = await db.execute(select(Memory).where(Memory.id == mid))
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    mem.access_count = (mem.access_count or 0) + 1
    await db.commit()
    return _memory_to_dict(mem)


@router.patch("/memory/{memory_id}")
async def atualizar_memory(memory_id: str, payload: MemoryUpdatePayload, db: AsyncSession = Depends(get_db)):
    """Atualiza campos de uma memória."""
    try:
        mid = uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido")
    result = await db.execute(select(Memory).where(Memory.id == mid))
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Memória não encontrada")

    changed = False
    if payload.title is not None:
        mem.title = payload.title
        changed = True
    if payload.content is not None:
        mem.content = payload.content
        changed = True
    if payload.tags is not None:
        mem.tags = payload.tags
        changed = True
    if payload.confidence is not None:
        mem.confidence = max(0.0, min(1.0, payload.confidence))
        changed = True
    if payload.archived is not None:
        mem.archived = payload.archived
        if payload.archived:
            try:
                await asyncio.to_thread(_memory_qdrant.remove_memory, mem.id)
            except Exception:
                pass
            await _event_bus.publish_event(
                db,
                type="memory.archived",
                actor="system",
                payload={"memory_id": str(mem.id), "type": mem.type},
                source_table="memories",
                source_id=mem.id,
            )
        else:
            # Re-indexa se desarquivado
            try:
                await asyncio.to_thread(_memory_qdrant.index_memory, mem)
            except Exception:
                pass
        changed = True

    if changed:
        await db.commit()
    return _memory_to_dict(mem)


@router.delete("/memory/{memory_id}")
async def arquivar_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Soft delete: marca archived=true. Hard delete não suportado."""
    try:
        mid = uuid.UUID(memory_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID inválido")
    result = await db.execute(select(Memory).where(Memory.id == mid))
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    mem.archived = True
    try:
        await asyncio.to_thread(_memory_qdrant.remove_memory, mem.id)
    except Exception:
        pass
    await _event_bus.publish_event(
        db,
        type="memory.archived",
        actor="system",
        payload={"memory_id": str(mem.id), "type": mem.type},
        source_table="memories",
        source_id=mem.id,
    )
    await db.commit()
    return {"status": "archived", "id": str(mem.id)}


@router.get("/events")
async def listar_events(
    type: str | None = None,
    type_prefix: str | None = None,  # ex: "signal." pega todos signal.*
    actor: str | None = None,
    projeto: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Timeline unificada de eventos."""
    q = select(Event)
    if type:
        q = q.where(Event.type == type)
    if type_prefix:
        q = q.where(Event.type.like(f"{type_prefix}%"))
    if actor:
        q = q.where(Event.actor == actor)
    if projeto:
        q = q.where(Event.projeto == projeto)
    if since:
        q = q.where(Event.ts >= since)
    q = q.order_by(Event.ts.desc()).limit(min(limit, 500))
    result = await db.execute(q)
    return [_event_to_dict(e) for e in result.scalars().all()]


@router.get("/causal/graph")
async def get_causal_graph(
    projeto: str | None = None,
    relation: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
):
    """Retorna grafo causal completo: nodes (com metadata) + edges.

    Filtros opcionais: projeto (filtra memories e events do projeto),
    relation (filtra tipo de edge).

    Estrutura retornada:
    {
      "nodes": [{"id", "type", "table", "label", "meta"}],
      "edges": [{"id", "source", "target", "relation", "confidence"}]
    }
    """
    q = select(CausalEdge)
    if relation:
        q = q.where(CausalEdge.relation == relation)
    q = q.order_by(CausalEdge.created_at.desc()).limit(min(limit, 3000))
    result = await db.execute(q)
    edges_raw = result.scalars().all()

    if not edges_raw:
        return {"nodes": [], "edges": []}

    # Agrupa IDs por tabela
    by_table: dict[str, set] = {}
    for e in edges_raw:
        by_table.setdefault(e.cause_table, set()).add(e.cause_id)
        by_table.setdefault(e.effect_table, set()).add(e.effect_id)

    # Resolve metadata por tabela
    nodes_by_id: dict[str, dict] = {}

    if "memories" in by_table:
        ids = list(by_table["memories"])
        r = await db.execute(select(Memory).where(Memory.id.in_(ids), Memory.archived == False))  # noqa: E712
        for m in r.scalars().all():
            if projeto and m.scope_ref and m.scope_ref != projeto:
                continue
            nodes_by_id[str(m.id)] = {
                "id": str(m.id),
                "table": "memories",
                "type": m.type,
                "label": (m.title or "")[:80],
                "meta": {
                    "scope": m.scope,
                    "scope_ref": m.scope_ref,
                    "confidence": m.confidence,
                    "tags": m.tags or [],
                },
            }

    if "architectural_decisions" in by_table:
        from app.db.models import ArchitecturalDecision, IndexedRepo
        ids = list(by_table["architectural_decisions"])
        r = await db.execute(
            select(ArchitecturalDecision, IndexedRepo)
            .join(IndexedRepo, ArchitecturalDecision.repo_id == IndexedRepo.id)
            .where(ArchitecturalDecision.id.in_(ids))
        )
        for d, repo in r.all():
            if projeto and repo.github_full_name != projeto:
                continue
            nodes_by_id[str(d.id)] = {
                "id": str(d.id),
                "table": "architectural_decisions",
                "type": "decision",
                "label": f"PR #{d.pr_number}: {(d.pr_title or '')[:70]}",
                "meta": {
                    "repo": repo.github_full_name,
                    "pr_number": d.pr_number,
                    "impact_areas": d.impact_areas or [],
                    "breaking_changes": d.breaking_changes,
                },
            }

    if "dev_signals" in by_table:
        ids = list(by_table["dev_signals"])
        r = await db.execute(select(DevSignal).where(DevSignal.id.in_(ids)))
        for s in r.scalars().all():
            if projeto and s.projeto != projeto:
                continue
            label = f"{s.tipo} · {s.dev}"
            arquivo = (s.dados or {}).get("arquivo")
            if arquivo:
                label += f" · {arquivo.rsplit('/', 1)[-1]}"
            nodes_by_id[str(s.id)] = {
                "id": str(s.id),
                "table": "dev_signals",
                "type": s.tipo,
                "label": label[:90],
                "meta": {"projeto": s.projeto, "dev": s.dev, "ts": s.ts.isoformat() if s.ts else None},
            }

    if "events" in by_table:
        ids = list(by_table["events"])
        r = await db.execute(select(Event).where(Event.id.in_(ids)))
        for e in r.scalars().all():
            if projeto and e.projeto and e.projeto != projeto:
                continue
            nodes_by_id[str(e.id)] = {
                "id": str(e.id),
                "table": "events",
                "type": e.type,
                "label": f"{e.type} · {e.actor or '?'}",
                "meta": {"projeto": e.projeto, "actor": e.actor},
            }

    # Edges — só inclui se ambos os nodes resolveram (filtro de projeto)
    edges = []
    for e in edges_raw:
        cause = str(e.cause_id)
        effect = str(e.effect_id)
        if cause not in nodes_by_id or effect not in nodes_by_id:
            continue
        edges.append({
            "id": str(e.id),
            "source": cause,
            "target": effect,
            "relation": e.relation,
            "confidence": e.confidence,
            "detected_by": e.detected_by,
        })

    return {
        "nodes": list(nodes_by_id.values()),
        "edges": edges,
        "totals": {
            "nodes": len(nodes_by_id),
            "edges": len(edges),
            "edges_total_db": len(edges_raw),
        },
    }


@router.get("/causal/{table}/{node_id}")
async def get_causal_edges(table: str, node_id: str, direction: str = "both", db: AsyncSession = Depends(get_db)):
    """Retorna edges causais conectadas a um nó.

    direction: 'in' (causes), 'out' (effects), 'both' (default)
    """
    try:
        nid = uuid.UUID(node_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="node_id inválido")

    edges_in = []
    edges_out = []

    if direction in ("in", "both"):
        r = await db.execute(
            select(CausalEdge).where(CausalEdge.effect_table == table, CausalEdge.effect_id == nid)
        )
        edges_in = [_edge_to_dict(e) for e in r.scalars().all()]

    if direction in ("out", "both"):
        r = await db.execute(
            select(CausalEdge).where(CausalEdge.cause_table == table, CausalEdge.cause_id == nid)
        )
        edges_out = [_edge_to_dict(e) for e in r.scalars().all()]

    return {"node": {"table": table, "id": node_id}, "in": edges_in, "out": edges_out}


@router.post("/causal")
async def criar_causal_edge(
    cause_table: str,
    cause_id: str,
    effect_table: str,
    effect_id: str,
    relation: str,
    confidence: float = 1.0,
    detected_by: str | None = "manual",
    notes: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Cria edge causal manualmente. Idempotente via unique constraint."""
    try:
        cid = uuid.UUID(cause_id)
        eid = uuid.UUID(effect_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="IDs inválidos")

    # Verifica se já existe
    existing = await db.execute(
        select(CausalEdge).where(
            CausalEdge.cause_table == cause_table,
            CausalEdge.cause_id == cid,
            CausalEdge.effect_table == effect_table,
            CausalEdge.effect_id == eid,
            CausalEdge.relation == relation,
        )
    )
    edge = existing.scalar_one_or_none()
    if edge:
        edge.confidence = max(edge.confidence, confidence)
        if notes:
            edge.notes = notes
        await db.commit()
        return _edge_to_dict(edge)

    edge = CausalEdge(
        cause_table=cause_table,
        cause_id=cid,
        effect_table=effect_table,
        effect_id=eid,
        relation=relation,
        confidence=max(0.0, min(1.0, confidence)),
        detected_by=detected_by,
        notes=notes,
    )
    db.add(edge)
    await db.commit()
    return _edge_to_dict(edge)


# ── helpers de serialização ─────────────────────────────────────────────────

def _memory_to_dict(m: Memory) -> dict:
    return {
        "id": str(m.id),
        "type": m.type,
        "scope": m.scope,
        "scope_ref": m.scope_ref,
        "title": m.title,
        "content": m.content,
        "tags": m.tags or [],
        "confidence": m.confidence,
        "access_count": m.access_count,
        "source_type": m.source_type,
        "source_ref": m.source_ref,
        "expires_at": m.expires_at.isoformat() if m.expires_at else None,
        "archived": m.archived,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


def _event_to_dict(e: Event) -> dict:
    return {
        "id": str(e.id),
        "type": e.type,
        "actor": e.actor,
        "projeto": e.projeto,
        "payload": e.payload or {},
        "source_table": e.source_table,
        "source_id": str(e.source_id) if e.source_id else None,
        "ts": e.ts.isoformat() if e.ts else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ── Agentes ─────────────────────────────────────────────────────────────────

@router.get("/agents")
async def listar_agents():
    """Lista agentes registrados com metadata (model, subscribes, cron)."""
    from app.agents import registry
    registry.ensure_loaded()
    return registry.list_agents()


@router.post("/agents/{agent_name}/run")
async def run_agent(agent_name: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)):
    """Trigger manual de um agente. payload vai como `input` do run."""
    from app.agents import registry
    from app.agents.base import execute_agent
    registry.ensure_loaded()

    agent = registry.get_agent(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agente '{agent_name}' não registrado")

    run = await execute_agent(agent, db, trigger_type="manual", input=payload or {})
    return {
        "id": str(run.id),
        "agent_name": run.agent_name,
        "status": run.status,
        "duration_ms": run.duration_ms,
        "output": run.output,
        "error_message": run.error_message,
        "cost_estimate": run.cost_estimate,
    }


@router.post("/agent_subscriptions")
async def criar_agent_subscription(
    agent_name: str,
    projeto: str,
    config: dict | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Habilita um agente em um projeto. Idempotente — re-enable se já existir disabled."""
    existing = await db.execute(
        select(AgentSubscription).where(
            AgentSubscription.agent_name == agent_name,
            AgentSubscription.projeto == projeto,
        )
    )
    sub = existing.scalar_one_or_none()
    if sub:
        sub.enabled = True
        if config is not None:
            sub.config = config
        await db.commit()
        return _subscription_to_dict(sub)
    sub = AgentSubscription(agent_name=agent_name, projeto=projeto, enabled=True, config=config or {})
    db.add(sub)
    await db.commit()
    return _subscription_to_dict(sub)


@router.get("/agent_subscriptions")
async def listar_agent_subscriptions(
    agent_name: str | None = None,
    projeto: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Lista subscriptions com filtros opcionais."""
    q = select(AgentSubscription)
    if agent_name:
        q = q.where(AgentSubscription.agent_name == agent_name)
    if projeto:
        q = q.where(AgentSubscription.projeto == projeto)
    q = q.order_by(AgentSubscription.agent_name, AgentSubscription.projeto)
    result = await db.execute(q)
    return [_subscription_to_dict(s) for s in result.scalars().all()]


@router.delete("/agent_subscriptions")
async def remover_agent_subscription(
    agent_name: str,
    projeto: str,
    db: AsyncSession = Depends(get_db),
):
    """Desabilita (soft) — agente para de rodar nesse projeto."""
    result = await db.execute(
        select(AgentSubscription).where(
            AgentSubscription.agent_name == agent_name,
            AgentSubscription.projeto == projeto,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription não encontrada")
    sub.enabled = False
    await db.commit()
    return {"status": "disabled", "id": str(sub.id)}


def _subscription_to_dict(s: AgentSubscription) -> dict:
    return {
        "id": str(s.id),
        "agent_name": s.agent_name,
        "projeto": s.projeto,
        "enabled": s.enabled,
        "config": s.config or {},
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/agent_runs")
async def listar_agent_runs(
    agent_name: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Lista execuções de agentes."""
    q = select(AgentRun)
    if agent_name:
        q = q.where(AgentRun.agent_name == agent_name)
    if status:
        q = q.where(AgentRun.status == status)
    q = q.order_by(AgentRun.started_at.desc()).limit(min(limit, 200))
    result = await db.execute(q)
    return [
        {
            "id": str(r.id),
            "agent_name": r.agent_name,
            "model": r.model,
            "trigger_type": r.trigger_type,
            "trigger_ref": r.trigger_ref,
            "status": r.status,
            "error_message": r.error_message,
            "duration_ms": r.duration_ms,
            "cost_estimate": r.cost_estimate,
            "input": r.input or {},
            "output": r.output or {},
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in result.scalars().all()
    ]


def _edge_to_dict(c: CausalEdge) -> dict:
    return {
        "id": str(c.id),
        "cause": {"table": c.cause_table, "id": str(c.cause_id)},
        "effect": {"table": c.effect_table, "id": str(c.effect_id)},
        "relation": c.relation,
        "confidence": c.confidence,
        "detected_by": c.detected_by,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/security/audit-log")
async def get_audit_log(limit: int = 100):
    """Retorna as últimas entradas do audit log de autenticação."""
    from app.main import _audit_log, _hub_started_at
    entries = list(_audit_log)[-limit:]
    entries.reverse()
    return {"entries": entries, "total": len(_audit_log),
            "mode": "audit" if settings.hub_auth_audit else "enforce",
            "hub_started_at": _hub_started_at}


@router.post("/security/enforce", dependencies=[Depends(require_admin)])
async def set_enforce_mode():
    """Muda de audit para enforce (irreversível via API — requer .env para desfazer)."""
    settings.hub_auth_audit = False
    return {"status": "enforcing"}


@router.delete("/devs/{dev}", dependencies=[Depends(require_admin)])
async def remover_dev_local(dev: str, db: AsyncSession = Depends(get_db)):
    """Remove um LocalDev. Dados de sessão/sinais isolados são preservados."""
    result = await db.execute(select(LocalDev).where(LocalDev.name == dev))
    ld = result.scalar_one_or_none()
    if not ld:
        raise HTTPException(status_code=404, detail=f"Dev '{dev}' não encontrado")
    await db.delete(ld)
    await db.commit()
    return {"status": "deleted", "dev": dev}
