import json

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.services import github_client
from app.services.reflection import process_pr

router = APIRouter()


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

    if event == "pull_request":
        action = payload.get("action")
        pr = payload.get("pull_request", {})

        if action == "closed" and pr.get("merged"):
            full_name = payload.get("repository", {}).get("full_name", "")
            pr_number = pr.get("number")
            merged_at = pr.get("merged_at")

            if full_name and pr_number:
                result = await process_pr(full_name, pr_number, merged_at, db)
                return {"status": "processed", **result}

    return {"status": "ignored", "event": event}
