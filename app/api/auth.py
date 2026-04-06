from fastapi import APIRouter

router = APIRouter()


@router.get("/login")
async def github_login():
    """Redirect to GitHub OAuth flow."""
    # TODO: Fase 3 — Redirecionar para GitHub OAuth
    return {"message": "GitHub OAuth not yet implemented"}


@router.get("/callback")
async def github_callback(code: str):
    """Handle GitHub OAuth callback, issue JWT."""
    # TODO: Fase 3 — Trocar code por token, criar JWT
    return {"message": "Callback not yet implemented"}


@router.get("/me")
async def get_current_user():
    """Return current user profile and accessible repos."""
    # TODO: Fase 3 — Validar JWT, retornar perfil
    return {"message": "Auth not yet implemented"}
