from celery import Celery
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
)


# TODO: Fase 1C — Task: index_repo_task(github_full_name: str)
# TODO: Fase 4 — Task: process_pr_reflection(repo: str, pr_number: int)
# TODO: Fase 6 — Beat schedule: heartbeat tasks
