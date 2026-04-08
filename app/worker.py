from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "second_brain_hub",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "heartbeat-check-every-30min": {
            "task": "app.worker.heartbeat_check",
            "schedule": crontab(minute="*/30"),
        },
        "refresh-permissions-hourly": {
            "task": "app.worker.refresh_all_permissions",
            "schedule": crontab(minute=0),
        },
    },
)


@celery_app.task(name="app.worker.heartbeat_check")
def heartbeat_check():
    """Verifica: PRs sem review, conflitos de dep, docs desatualizados."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.db.models import IndexedRepo, Notification

    async def run():
        engine = create_async_engine(settings.database_url, echo=False)
        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with session_factory() as db:
            notifications = []

            # Verifica repos indexados e gera notificações
            from sqlalchemy import select
            result = await db.execute(select(IndexedRepo).where(IndexedRepo.indexing_status == "done"))
            repos = result.scalars().all()

            # Carrega notificações não lidas existentes para deduplicação
            from sqlalchemy import select
            existing_result = await db.execute(
                select(Notification.repo, Notification.metadata)
                .where(Notification.read == False, Notification.type == "stale_pr")
            )
            existing_keys = {
                (row.repo, str(row.metadata.get("pr_number") if row.metadata else ""))
                for row in existing_result
            }

            for repo in repos:
                # Verifica PRs abertos há mais de 3 dias (via GitHub API)
                try:
                    stale_prs = await _check_stale_prs(repo.github_full_name)
                    for pr in stale_prs:
                        key = (repo.github_full_name, str(pr["number"]))
                        if key in existing_keys:
                            continue  # já existe notificação não lida para este PR
                        notifications.append(Notification(
                            type="stale_pr",
                            repo=repo.github_full_name,
                            message=f"PR #{pr['number']} '{pr['title']}' aberto ha {pr['days']} dias sem review",
                            metadata={"pr_number": pr["number"], "days_open": pr["days"]},
                        ))
                except Exception:
                    pass

            for n in notifications:
                db.add(n)
            if notifications:
                await db.commit()

        await engine.dispose()
        return len(notifications)

    return asyncio.run(run())


async def _check_stale_prs(full_name: str, stale_days: int = 3) -> list[dict]:
    """Retorna PRs abertos há mais de stale_days dias."""
    import httpx
    from datetime import datetime, timezone, timedelta
    from app.core.config import settings

    if not settings.github_pat:
        return []

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{full_name}/pulls",
            headers={"Authorization": f"Bearer {settings.github_pat}", "Accept": "application/vnd.github+json"},
            params={"state": "open", "per_page": 20},
        )
        if resp.status_code != 200:
            return []

        stale = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=stale_days)
        for pr in resp.json():
            created_at = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
            if created_at < cutoff:
                days_open = (datetime.now(timezone.utc) - created_at).days
                stale.append({"number": pr["number"], "title": pr["title"], "days": days_open})
        return stale


@celery_app.task(name="app.worker.refresh_all_permissions")
def refresh_all_permissions():
    """Atualiza permissões de todos os usuários via GitHub API."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.db.models import User
    from app.core.security import decrypt_token, get_github_user_repos

    async def run():
        engine = create_async_engine(settings.database_url, echo=False)
        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with session_factory() as db:
            from sqlalchemy import select
            result = await db.execute(select(User))
            users = result.scalars().all()
            updated = 0

            for user in users:
                try:
                    token = decrypt_token(user.access_token_encrypted)
                    repos = await get_github_user_repos(token)
                    user.repos_allowed = repos
                    updated += 1
                except Exception:
                    pass

            if updated:
                await db.commit()

        await engine.dispose()
        return updated

    return asyncio.run(run())


@celery_app.task(name="app.worker.index_repo_task")
def index_repo_task(github_full_name: str):
    """Task assíncrona para indexar um repo."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.services.indexing_pipeline import index_repo

    async def run():
        engine = create_async_engine(settings.database_url, echo=False)
        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as db:
            result = await index_repo(github_full_name, db)
        await engine.dispose()
        return result

    return asyncio.run(run())
