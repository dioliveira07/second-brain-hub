from celery import Celery
from celery.schedules import crontab
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.db.session import engine, async_session


def _fresh_session_factory():
    """Engine novo por task — evita 'Event loop is closed' em Celery prefork.

    asyncpg bind connections ao event loop. Celery cria loop novo por task,
    então não dá pra reusar engine de módulo. NullPool não cacheia conexão.
    """
    fresh_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(fresh_engine, class_=AsyncSession, expire_on_commit=False)
    return fresh_engine, factory

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
        "dispatch-events-every-30s": {
            "task": "app.worker.dispatch_events",
            "schedule": 30.0,  # segundos
        },
        "decay-memories-daily-3am": {
            "task": "app.worker.decay_memories",
            "schedule": crontab(hour=3, minute=0),
        },
        "pattern-detector-daily-4am": {
            "task": "app.worker.run_pattern_detector",
            "schedule": crontab(hour=4, minute=0),
        },
        "daily-digest-19h": {
            "task": "app.worker.run_daily_digest",
            "schedule": crontab(hour=19, minute=0),
        },
    },
)


@celery_app.task(name="app.worker.heartbeat_check")
def heartbeat_check():
    """Verifica: PRs sem review, conflitos de dep, docs desatualizados."""
    import asyncio
    from app.db.models import IndexedRepo, Notification

    async def run():
        async with async_session() as db:
            notifications = []

            # Verifica repos indexados e gera notificações
            from sqlalchemy import select
            result = await db.execute(select(IndexedRepo).where(IndexedRepo.indexing_status == "done"))
            repos = result.scalars().all()

            # Carrega notificações não lidas existentes para deduplicação
            from sqlalchemy import select
            existing_result = await db.execute(
                select(Notification.repo, Notification.extra_data)
                .where(Notification.read == False, Notification.type == "stale_pr")
            )
            existing_keys = {
                (row.repo, str(row.extra_data.get("pr_number") if row.extra_data else ""))
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
                            extra_data={"pr_number": pr["number"], "days_open": pr["days"]},
                        ))
                except Exception:
                    pass

            for n in notifications:
                db.add(n)
            if notifications:
                await db.commit()

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
    from app.db.models import User
    from app.core.security import decrypt_token, get_github_user_repos

    async def run():
        async with async_session() as db:
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

        return updated

    return asyncio.run(run())


@celery_app.task(name="app.worker.index_repo_task")
def index_repo_task(github_full_name: str, changed_files: list | None = None):
    """Task assíncrona para indexar um repo. Se changed_files for passado, reindexar só esses."""
    import asyncio
    from app.services.indexing_pipeline import index_repo

    async def run():
        async with async_session() as db:
            result = await index_repo(github_full_name, db, changed_files=changed_files)
        return result

    return asyncio.run(run())


# ── Foundation v2: agent dispatch + decay ───────────────────────────────────

@celery_app.task(name="app.worker.dispatch_events")
def dispatch_events():
    """Polla events não-processados e dispatcha para agentes inscritos.

    Estado de "última posição" é mantido por agente em Redis
    (chave agent:<name>:last_event_ts). Roda a cada 30s.
    """
    import asyncio
    return asyncio.run(_dispatch_events_async())


async def _dispatch_events_async():
    from sqlalchemy import select
    from datetime import datetime, timezone, timedelta
    from app.db.models import Event
    from app.agents import registry
    from app.agents.base import execute_agent
    from app.services import event_bus

    registry.ensure_loaded()
    redis = await event_bus._get_redis()
    if not redis:
        return {"error": "redis indisponivel"}

    fresh_engine, fresh_factory = _fresh_session_factory()
    dispatched = 0
    errors = 0

    try:
        async with fresh_factory() as db:
            since = datetime.now(timezone.utc) - timedelta(hours=2)
            result = await db.execute(
                select(Event).where(Event.ts >= since).order_by(Event.ts.asc())
            )
            events = result.scalars().all()

        for ev in events:
            agent_classes = registry.agents_for_event(ev.type)
            if not agent_classes:
                continue

            for cls in agent_classes:
                state_key = f"agent:{cls.NAME}:last_event_ts"
                last_ts_str = await redis.get(state_key)
                last_ts = None
                if last_ts_str:
                    try:
                        last_ts = datetime.fromisoformat(last_ts_str)
                    except Exception:
                        last_ts = None

                if last_ts and ev.ts <= last_ts:
                    continue

                try:
                    async with fresh_factory() as db2:
                        agent = cls()
                        event_dict = {
                            "id": str(ev.id),
                            "type": ev.type,
                            "actor": ev.actor,
                            "projeto": ev.projeto,
                            "payload": ev.payload or {},
                            "source_table": ev.source_table,
                            "source_id": str(ev.source_id) if ev.source_id else None,
                            "ts": ev.ts.isoformat(),
                        }
                        await execute_agent(
                            agent, db2,
                            trigger_type="event",
                            trigger_ref=str(ev.id),
                            event=event_dict,
                        )
                    dispatched += 1
                except Exception:
                    errors += 1

                await redis.set(state_key, ev.ts.isoformat())
    finally:
        await fresh_engine.dispose()
        # fecha redis para evitar warnings
        try:
            await event_bus.close()
        except Exception:
            pass

    return {"dispatched": dispatched, "errors": errors, "events_scanned": len(events)}


@celery_app.task(name="app.worker.decay_memories")
def decay_memories():
    """Roda decay_worker uma vez por dia."""
    import asyncio
    return asyncio.run(_decay_memories_async())


async def _decay_memories_async():
    return await _run_cron_agent("decay_worker")


@celery_app.task(name="app.worker.run_pattern_detector")
def run_pattern_detector():
    import asyncio
    return asyncio.run(_run_cron_agent("pattern_detector"))


@celery_app.task(name="app.worker.run_daily_digest")
def run_daily_digest():
    import asyncio
    return asyncio.run(_run_cron_agent("daily_digest"))


async def _run_cron_agent(name: str):
    """Roda agente cron-trigger genericamente. Usa engine fresh por task."""
    from app.agents import registry
    from app.agents.base import execute_agent

    registry.ensure_loaded()
    agent = registry.get_agent(name)
    if not agent:
        return {"error": f"{name} não registrado"}

    fresh_engine, fresh_factory = _fresh_session_factory()
    try:
        async with fresh_factory() as db:
            run = await execute_agent(agent, db, trigger_type="cron")
            return {"agent_run_id": str(run.id), "status": run.status, "output": run.output}
    finally:
        await fresh_engine.dispose()
