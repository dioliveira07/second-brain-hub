"""
Cerebro — APIs de contexto de sessão e sinais de atividade.
F2: padrões de erro por projeto
F3: afinidade dev × projeto
F6: continuidade entre devs (última sessão por projeto)
"""
import base64
import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import SessionContext, DevSignal, MCPConnection, SSHIdentity

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessaoPayload(BaseModel):
    dev: str
    projeto: str
    branch: str = ""
    arquivos: list[str] = []
    ultimo_commit: str = ""
    timestamp: str  # ISO 8601


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
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(SessionContext(
            dev=payload.dev,
            projeto=payload.projeto,
            branch=payload.branch,
            arquivos=payload.arquivos,
            ultimo_commit=payload.ultimo_commit,
            timestamp=ts,
        ))

    await db.commit()
    return {"status": "ok"}


@router.get("/projeto/{projeto}/contexto")
async def get_contexto_projeto(projeto: str, db: AsyncSession = Depends(get_db)):
    """Retorna a sessão mais recente (de qualquer dev) no projeto."""
    result = await db.execute(
        select(SessionContext)
        .where(SessionContext.projeto == projeto)
        .order_by(SessionContext.timestamp.desc())
        .limit(1)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Nenhuma sessão encontrada para este projeto")

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
    """Retorna todas as sessões recentes de todos os devs e projetos."""
    result = await db.execute(
        select(SessionContext)
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


# ── F2/F3: Sinais ──────────────────────────────────────────────────────────────

@router.post("/sinal")
async def registrar_sinal(payload: SinalPayload, db: AsyncSession = Depends(get_db)):
    """Registra um sinal de atividade (erro, edição, skill)."""
    ts = datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
    db.add(DevSignal(
        tipo=payload.tipo,
        dev=payload.dev,
        projeto=payload.projeto,
        dados=payload.dados,
        ts=ts,
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
    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)

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
    return {"status": "ok", "expires_at": expires_at.isoformat()}


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


@router.post("/mcp/connect")
async def registrar_mcp_connection(payload: MCPConnectPayload, db: AsyncSession = Depends(get_db)):
    """Registra ou atualiza uma conexão de cliente MCP."""
    # Upsert por client_ip
    result = await db.execute(
        select(MCPConnection).where(MCPConnection.client_ip == payload.client_ip)
    )
    existing = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if existing:
        existing.last_seen_at = now
        if payload.client_name:
            existing.client_name = payload.client_name
        if payload.machine:
            existing.machine = payload.machine
    else:
        db.add(MCPConnection(
            client_ip=payload.client_ip,
            client_name=payload.client_name or None,
            machine=payload.machine or None,
            connected_at=now,
            last_seen_at=now,
        ))

    await db.commit()
    return {"status": "ok"}


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


@router.get("/afinidade")
async def get_afinidade_geral(dias: int = 30, db: AsyncSession = Depends(get_db)):
    """Retorna tabela completa de afinidade dev × projeto."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    result = await db.execute(
        select(DevSignal).where(
            DevSignal.tipo == "arquivo_editado",
            DevSignal.ts >= desde,
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
