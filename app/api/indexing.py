from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.indexing_pipeline import index_repo as run_pipeline

router = APIRouter()


class IndexRepoRequest(BaseModel):
    github_full_name: str


@router.post("/repo")
async def index_repo(request: IndexRepoRequest, db: AsyncSession = Depends(get_db)):
    result = await run_pipeline(request.github_full_name, db)
    return result
