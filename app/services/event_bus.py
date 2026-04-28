"""Event Bus interno — Redis pub/sub + persistência em events table.

Uso:
    from app.services.event_bus import publish_event

    await publish_event(
        db,
        type="signal.commit_realizado",
        actor="distefano",
        projeto="dioliveira07/second-brain-hub",
        payload={"sha": "abc123", "msg": "fix: foo"},
        source_table="dev_signals",
        source_id=signal.id,
    )

Workers se inscrevem com:

    async for event in subscribe("events:signal.*", "events:decision.*"):
        ...

A escrita em DB é authoritative — Redis pub/sub é best-effort para latência.
Se Redis falha, evento ainda persiste e é processável via cron fallback.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Event

logger = logging.getLogger("hub.event_bus")

# ── Redis client (lazy) ─────────────────────────────────────────────────────
_redis = None


async def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as redis_async
        _redis = redis_async.from_url(settings.redis_url, decode_responses=True)
        # ping para validar conexão na primeira call
        await _redis.ping()
        return _redis
    except Exception as e:
        logger.warning("Redis indisponível para pub/sub: %s — eventos só persistem em DB", e)
        _redis = False  # sentinel: não tentar novamente nesta call
        return None


def _channel_for(event_type: str) -> str:
    """Deriva canal pub/sub do tipo do evento.

    signal.commit_realizado → events:signal.commit_realizado
    decision.merged          → events:decision.merged
    """
    return f"events:{event_type}"


async def publish_event(
    db: AsyncSession,
    *,
    type: str,
    actor: str | None = None,
    projeto: str | None = None,
    payload: dict | None = None,
    source_table: str | None = None,
    source_id: uuid.UUID | None = None,
    ts: datetime | None = None,
) -> Event:
    """Persiste evento em DB e publica no Redis. DB é authoritative."""
    if ts is None:
        ts = datetime.now(timezone.utc)
    if payload is None:
        payload = {}

    event = Event(
        type=type,
        actor=actor,
        projeto=projeto,
        payload=payload,
        source_table=source_table,
        source_id=source_id,
        ts=ts,
    )
    db.add(event)
    await db.flush()  # popula event.id sem commit ainda (deixa pro caller)

    # Publica no Redis fire-and-forget — falha não bloqueia
    try:
        r = await _get_redis()
        if r:
            channel = _channel_for(type)
            msg = json.dumps({
                "id": str(event.id),
                "type": type,
                "actor": actor,
                "projeto": projeto,
                "payload": payload,
                "source_table": source_table,
                "source_id": str(source_id) if source_id else None,
                "ts": ts.isoformat(),
            })
            await r.publish(channel, msg)
    except Exception as e:
        logger.warning("falha ao publicar em Redis (evento persiste em DB): %s", e)

    return event


async def subscribe(*patterns: str) -> AsyncIterator[dict]:
    """Inscreve em padrões de canais (Redis psubscribe). Retorna eventos como dict.

    Uso:
        async for event in subscribe("events:signal.*", "events:decision.*"):
            print(event["type"], event["payload"])

    Reconecta automaticamente se Redis cair (delay 5s).
    """
    while True:
        try:
            r = await _get_redis()
            if not r:
                # Redis indisponível — espera e tenta de novo
                await asyncio.sleep(5)
                continue

            pubsub = r.pubsub()
            await pubsub.psubscribe(*patterns)

            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    data = json.loads(message["data"])
                    yield data
                except Exception as e:
                    logger.error("evento malformado em %s: %s", message.get("channel"), e)
        except Exception as e:
            logger.error("erro no loop de subscribe (%s) — reconectando em 5s", e)
            await asyncio.sleep(5)


async def close():
    """Fecha conexão Redis. Chamar em shutdown."""
    global _redis
    if _redis and _redis is not False:
        try:
            await _redis.aclose()
        except Exception:
            pass
    _redis = None
