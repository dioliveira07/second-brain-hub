import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from sqlalchemy import delete

from app.api import health, indexing, search, repos, webhooks, auth, notifications, graph, stats, cerebro
from app.core.config import settings
from app.db.session import init_db, async_session
from app.services.qdrant import init_collections
from app.services import embeddings


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
