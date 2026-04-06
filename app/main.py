from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.api import health, indexing, search, repos, webhooks, auth, notifications, graph, stats
from app.core.config import settings
from app.db.session import init_db
from app.services.qdrant import init_collections


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_collections()
    yield


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
