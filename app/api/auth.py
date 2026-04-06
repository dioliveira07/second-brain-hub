from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.security import (
    encrypt_token, decrypt_token, create_jwt, decode_jwt,
    get_github_user, get_github_user_repos
)
from app.db.session import get_db
from app.db.models import User

router = APIRouter()


async def get_current_user(authorization: str = Header(None), db: AsyncSession = Depends(get_db)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_jwt(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user


@router.get("/login")
async def github_login():
    if not settings.github_app_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth não configurado")
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_app_client_id}"
        f"&scope=read:user,repo"
        f"&redirect_uri={settings.hub_base_url}/api/v1/auth/callback"
    )
    return RedirectResponse(url)


@router.get("/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    if not settings.github_app_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth não configurado")
    # Troca code por access_token
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.github_app_client_id,
                "client_secret": settings.github_app_client_secret,
                "code": code,
                "redirect_uri": f"{settings.hub_base_url}/api/v1/auth/callback",
            },
            headers={"Accept": "application/json"},
        )
        data = resp.json()

    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Falha no OAuth")

    gh_user = await get_github_user(access_token)
    repos_allowed = await get_github_user_repos(access_token)

    result = await db.execute(select(User).where(User.github_id == gh_user["id"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            github_id=gh_user["id"],
            github_login=gh_user["login"],
            access_token_encrypted=encrypt_token(access_token),
            repos_allowed=repos_allowed,
        )
        db.add(user)
    else:
        user.access_token_encrypted = encrypt_token(access_token)
        user.repos_allowed = repos_allowed

    await db.commit()
    await db.refresh(user)

    jwt_token = create_jwt(str(user.id), user.github_login)
    return {"access_token": jwt_token, "token_type": "bearer", "github_login": user.github_login}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "github_login": current_user.github_login,
        "repos_allowed": current_user.repos_allowed,
        "proactivity_level": current_user.proactivity_level,
    }


@router.post("/refresh-permissions")
async def refresh_permissions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Refresh list of accessible repos from GitHub."""
    access_token = decrypt_token(current_user.access_token_encrypted)
    repos_allowed = await get_github_user_repos(access_token)
    current_user.repos_allowed = repos_allowed
    await db.commit()
    return {"repos_allowed": repos_allowed, "count": len(repos_allowed)}
