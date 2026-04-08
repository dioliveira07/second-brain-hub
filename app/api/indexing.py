from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()


class IndexRepoRequest(BaseModel):
    github_full_name: str


@router.post("/repo")
async def index_repo(request: IndexRepoRequest, db: AsyncSession = Depends(get_db)):
    """Dispara indexação via Celery worker — retorna imediatamente."""
    from app.worker import index_repo_task
    index_repo_task.delay(request.github_full_name)
    return {"status": "queued", "repo": request.github_full_name, "message": "Indexação em fila"}
