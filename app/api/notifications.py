import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Notification

router = APIRouter()


def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "type": n.type,
        "repo": n.repo,
        "message": n.message,
        "metadata": n.extra_data,
        "read": n.read,
        "created_at": n.created_at,
    }


@router.get("")
async def get_notifications(
    unread_only: bool = Query(False),
    type: str | None = Query(None),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    query = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        query = query.where(Notification.read == False)
    if type:
        query = query.where(Notification.type == type)
    result = await db.execute(query)
    return [_serialize(n) for n in result.scalars().all()]


class CreateNotificationBody(BaseModel):
    type: str
    message: str
    repo: str | None = None
    metadata: dict[str, Any] = {}


@router.post("")
async def create_notification(body: CreateNotificationBody, db: AsyncSession = Depends(get_db)):
    n = Notification(
        type=body.type,
        message=body.message,
        repo=body.repo,
        extra_data=body.metadata,
    )
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return _serialize(n)


class UpdateNotificationBody(BaseModel):
    message: str | None = None
    metadata: dict[str, Any] | None = None
    read: bool | None = None


@router.patch("/{notification_id}")
async def update_notification(
    notification_id: str,
    body: UpdateNotificationBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Notification).where(Notification.id == uuid.UUID(notification_id)))
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if body.message is not None:
        n.message = body.message
    if body.metadata is not None:
        n.extra_data = body.metadata
    if body.read is not None:
        n.read = body.read
    await db.commit()
    return _serialize(n)


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Notification).where(Notification.id == uuid.UUID(notification_id)))
    n = result.scalar_one_or_none()
    if n:
        n.read = True
        await db.commit()
    return {"status": "ok"}
