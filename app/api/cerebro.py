"""
Cerebro — APIs de contexto de sessão e sinais de atividade.
F2: padrões de erro por projeto
F3: afinidade dev × projeto
F6: continuidade entre devs (última sessão por projeto)
"""
import base64
import hashlib
import math
import os
import secrets
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select, delete, text, or_, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.db.models import SessionContext, DevSignal, MCPConnection, SSHIdentity, ChatMessage, LocalDev, Notification

router = APIRouter()


# ── Admin auth ─────────────────────────────────────────────────────────────────

def require_admin(x_admin_token: str = Header(None)):
    if not settings.admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Token admin inválido")


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
    """Registra um sinal de atividade (erro, edição, skill)."""
    ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
    isolated_owner = await get_isolated_owner(payload.dev, db)
    db.add(DevSignal(
        tipo=payload.tipo,
        dev=payload.dev,
        projeto=payload.projeto,
        dados=payload.dados,
        ts=ts,
        isolated_owner=isolated_owner,
    ))
    await db.commit()
    return {"status": "ok"}


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
        )
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
        )
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


@router.post("/mcp/connect")
async def registrar_mcp_connection(payload: MCPConnectPayload, db: AsyncSession = Depends(get_db)):
    """Registra ou atualiza uma conexão de cliente MCP."""
    result = await db.execute(
        select(MCPConnection).where(MCPConnection.client_ip == payload.client_ip)
    )
    existing = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if existing:
        update_skills = bool(existing.pending_skills_update)
        existing.last_seen_at = now
        if payload.client_name:
            existing.client_name = payload.client_name
        if payload.machine:
            existing.machine = payload.machine
        if update_skills:
            existing.pending_skills_update = False
            existing.skills_updated_at = now
    else:
        update_skills = False
        db.add(MCPConnection(
            client_ip=payload.client_ip,
            client_name=payload.client_name or None,
            machine=payload.machine or None,
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

    # Distribuir chave para máquinas já registradas (bootstrap seguro)
    # Só retorna para máquinas conhecidas (existing); novas precisam de onboarding manual
    hub_key = settings.hub_api_key if (existing and settings.hub_api_key) else None

    return {"status": "ok", "update_skills": update_skills,
            "task_notifications": task_notifications,
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
            "ativo": (agora - c.last_seen_at).total_seconds() < 28800,  # 8h
            "skills_updated_at": c.skills_updated_at.isoformat() if c.skills_updated_at else None,
            "skills_pending": c.pending_skills_update,
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
        select(DevSignal).where(DevSignal.tipo == "erro_bash", DevSignal.ts >= desde)
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
        select(DevSignal).where(DevSignal.ts >= desde)
    )
    sinais = sinais_res.scalars().all()

    sessoes_res = await db.execute(
        select(SessionContext).where(SessionContext.timestamp >= desde)
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
        ).order_by(DevSignal.ts.asc())
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
        )
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


class SBHBindPayload(BaseModel):
    sbh_token: str
    dev: str
    dev_token: str  # token do LocalDev para validar identidade


@router.post("/devs/register", dependencies=[Depends(require_admin)])
async def registrar_dev_local(payload: LocalDevCreate, db: AsyncSession = Depends(get_db)):
    """Registra um novo dev local (sem GitHub OAuth). Retorna o token gerado — guarde-o."""
    existing = await db.execute(select(LocalDev).where(LocalDev.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Dev '{payload.name}' já existe")

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

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
    ld.token_hash = hashlib.sha256(token.encode()).hexdigest()
    await db.commit()
    return {"status": "rotated", "dev": dev, "token": token}


@router.post("/devs/auth")
async def autenticar_dev_local(dev: str, token: str, db: AsyncSession = Depends(get_db)):
    """Valida token de um LocalDev. Usado pelo sbh-auth para vincular sessão."""
    result = await db.execute(select(LocalDev).where(LocalDev.name == dev))
    ld = result.scalar_one_or_none()
    if not ld:
        raise HTTPException(status_code=401, detail="Dev não encontrado")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if not secrets.compare_digest(token_hash, ld.token_hash):
        raise HTTPException(status_code=401, detail="Token inválido")
    return {
        "dev": ld.name,
        "display_name": ld.display_name,
        "isolated": ld.isolated,
        "project_scope": ld.project_scope,
    }


@router.get("/security/audit-log")
async def get_audit_log(limit: int = 100):
    """Retorna as últimas entradas do audit log de autenticação."""
    from app.main import _audit_log
    entries = list(_audit_log)[-limit:]
    entries.reverse()
    return {"entries": entries, "total": len(_audit_log), "mode": "audit" if settings.hub_auth_audit else "enforce"}


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
