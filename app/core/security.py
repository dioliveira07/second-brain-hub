"""JWT creation/validation and GitHub OAuth utilities."""
import base64
import hashlib
import httpx
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet
import jwt
from app.core.config import settings

# Fernet key derivada do SECRET_KEY (32 bytes base64)
_fernet_key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
_fernet = Fernet(_fernet_key)


def encrypt_token(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    return _fernet.decrypt(encrypted.encode()).decode()


def create_jwt(user_id: str, github_login: str, expires_hours: int = 24 * 7) -> str:
    payload = {
        "sub": user_id,
        "login": github_login,
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


async def get_github_user(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
        return resp.json()


async def get_github_user_repos(access_token: str) -> list[str]:
    """Return list of full_names the user has access to."""
    repos = []
    async with httpx.AsyncClient() as client:
        page = 1
        while True:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
                params={"per_page": 100, "page": page, "sort": "updated"},
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            if not data:
                break
            repos.extend(r["full_name"] for r in data)
            if len(data) < 100:
                break
            page += 1
    return repos
