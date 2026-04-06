from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/github")
async def github_webhook(request: Request):
    """Receive GitHub webhook events (PR merged, push, etc.)."""
    # TODO: Fase 4 — Validar signature, processar PR mergeado, triggerar reflection
    return {"status": "received"}
