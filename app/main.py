import asyncio
import ipaddress
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from sqlalchemy import delete

from app.api import health, indexing, search, repos, webhooks, auth, notifications, graph, stats, cerebro
from app.core.config import settings
from app.db.session import init_db, async_session
from app.services.qdrant import init_collections
from app.services import embeddings

logger = logging.getLogger("hub.auth")

# ── Audit log em memória (últimas 500 entradas) ───────────────────────────────
from collections import deque
_audit_log: deque = deque(maxlen=500)
_hub_started_at: str = datetime.now(timezone.utc).isoformat()
_auth_success: dict = {}  # ip → último timestamp de sucesso (dedup 5min)

_INTERNAL_NETWORKS = [
    ipaddress.ip_network("172.16.0.0/12"),   # Docker bridge
    ipaddress.ip_network("10.0.0.0/8"),       # Docker custom networks
    ipaddress.ip_network("127.0.0.0/8"),      # loopback
]

_AUTH_SKIP_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json", "/api/v1/webhooks/", "/api/cerebro/bootstrap")


def _is_internal(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in net for net in _INTERNAL_NETWORKS)
    except ValueError:
        return False


async def cleanup_sessions():
    """Remove sessões expiradas, ghosts e MCPs inativos do banco."""
    from app.db.models import SSHIdentity, MCPConnection
    while True:
        try:
            async with async_session() as db:
                now = datetime.now(timezone.utc)
                # 1) Sessões SSH/dev expiradas
                await db.execute(
                    delete(SSHIdentity).where(SSHIdentity.expires_at <= now)
                )
                # 2) Ghosts: sem machine_hostname E sem projeto, com mais de 1h
                ghost_cutoff = now - timedelta(hours=1)
                await db.execute(
                    delete(SSHIdentity).where(
                        SSHIdentity.machine_hostname.is_(None),
                        SSHIdentity.projeto.is_(None),
                        SSHIdentity.updated_at <= ghost_cutoff,
                    )
                )
                # 3) Conexões MCP não vistas há mais de 24h
                mcp_cutoff = now - timedelta(hours=24)
                await db.execute(
                    delete(MCPConnection).where(MCPConnection.last_seen_at <= mcp_cutoff)
                )
                await db.commit()
        except Exception:
            pass
        await asyncio.sleep(3600)  # roda a cada 1h


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_collections()
    # Modelo de embeddings carregado lazy — apenas na primeira busca
    # Indexação roda no celery-worker, não aqui
    task = asyncio.create_task(cleanup_sessions())
    yield
    task.cancel()


app = FastAPI(
    title="Second Brain Hub",
    description="Segundo Cérebro Corporativo — Hub Central",
    version="0.1.0",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = [
    "https://hub.fluxiom.com.br",
    "http://localhost:3000",
    "http://localhost:8010",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["X-Hub-Key", "X-Admin-Token", "Content-Type", "Authorization"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.middleware("http")
async def hub_auth_middleware(request: Request, call_next):
    # Rotas públicas — sempre livres
    if any(request.url.path.startswith(p) for p in _AUTH_SKIP_PREFIXES):
        return await call_next(request)

    # Validar X-Hub-Key
    key = request.headers.get("X-Hub-Key", "")
    if settings.hub_api_key and key == settings.hub_api_key:
        client_ip = request.client.host if request.client else ""
        now = datetime.now(timezone.utc)
        last = _auth_success.get(client_ip)
        if not last or (now - last) > timedelta(minutes=5):
            _auth_success[client_ip] = now
            _audit_log.append({
                "ts": now.isoformat(),
                "mode": "OK",
                "method": request.method,
                "path": request.url.path,
                "ip": client_ip,
                "key_present": True,
            })
        return await call_next(request)

    # Falha de autenticação
    path = request.url.path
    client_ip = request.client.host if request.client else ""
    mode = "AUDIT" if settings.hub_auth_audit else "ENFORCE"
    logger.warning("[%s] Unauthorized %s %s — ip=%s key_present=%s",
                   mode, request.method, path, client_ip, bool(key))
    _audit_log.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "method": request.method,
        "path": path,
        "ip": client_ip,
        "key_present": bool(key),
    })

    if not settings.hub_auth_audit:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    # Modo audit: passa mas loga
    return await call_next(request)

app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(indexing.router, prefix="/api/v1/index", tags=["indexing"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(repos.router, prefix="/api/v1/repos", tags=["repos"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(graph.router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(stats.router, prefix="/api/v1/stats", tags=["stats"])
app.include_router(cerebro.router, prefix="/api/cerebro", tags=["cerebro"])
