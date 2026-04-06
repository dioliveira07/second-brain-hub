import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Notification

router = APIRouter()


@router.get("")
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    query = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        query = query.where(Notification.read == False)
    result = await db.execute(query)
    notifications = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "repo": n.repo,
            "message": n.message,
            "metadata": n.extra_data,
            "read": n.read,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Notification).where(Notification.id == uuid.UUID(notification_id)))
    n = result.scalar_one_or_none()
    if n:
        n.read = True
        await db.commit()
    return {"status": "ok"}
