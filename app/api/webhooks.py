import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.db.models import IndexedRepo
from app.services import github_client
from app.services.reflection import process_pr

router = APIRouter()

COOLDOWN_MINUTES = 10  # Não reindexar se indexado há menos de N minutos


@router.post("/github")
async def github_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not github_client.verify_webhook_signature(payload_bytes, signature, settings.github_webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event = request.headers.get("X-GitHub-Event", "")

    try:
        payload = json.loads(payload_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    full_name = payload.get("repository", {}).get("full_name", "")

    if event == "push":
        ref = payload.get("ref", "")
        default_branch = payload.get("repository", {}).get("default_branch", "main")
        if ref == f"refs/heads/{default_branch}" and full_name:
            # Cooldown: não reindexar se já foi indexado recentemente
            result = await db.execute(
                select(IndexedRepo).where(IndexedRepo.github_full_name == full_name)
            )
            repo = result.scalar_one_or_none()
            if repo and repo.last_indexed_at:
                age = datetime.now(timezone.utc) - repo.last_indexed_at
                if age < timedelta(minutes=COOLDOWN_MINUTES):
                    mins = int(age.total_seconds() / 60)
                    return {"status": "skipped", "reason": f"indexed {mins}min ago (cooldown: {COOLDOWN_MINUTES}min)", "repo": full_name}

            # Extrai arquivos adicionados/modificados dos commits (removidos não precisam ser indexados)
            changed_set: set[str] = set()
            for commit in payload.get("commits", []):
                changed_set.update(commit.get("added", []))
                changed_set.update(commit.get("modified", []))
            changed_files = list(changed_set)

            from app.worker import index_repo_task
            # Se o repo ainda não foi indexado (first-time), faz full index
            if repo is None or not changed_files:
                index_repo_task.delay(full_name)
                return {"status": "queued", "repo": full_name, "event": "push", "mode": "full"}
            else:
                index_repo_task.delay(full_name, changed_files)
                return {"status": "queued", "repo": full_name, "event": "push", "mode": "incremental", "files": len(changed_files)}

    if event == "pull_request":
        action = payload.get("action")
        pr = payload.get("pull_request", {})

        if action == "closed" and pr.get("merged"):
            pr_number = pr.get("number")
            merged_at = pr.get("merged_at")

            if full_name and pr_number:
                result = await process_pr(full_name, pr_number, merged_at, db)
                return {"status": "processed", **result}

    return {"status": "ignored", "event": event}
