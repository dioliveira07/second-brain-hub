"""Registry de agentes ativos.

Os agentes se registram via decorator @register no momento do import.
"""
from __future__ import annotations

from typing import Type

from app.agents.base import AgentBase

_REGISTRY: dict[str, Type[AgentBase]] = {}


def register(cls: Type[AgentBase]) -> Type[AgentBase]:
    """Decorator. Registra a classe pelo NAME."""
    if not getattr(cls, "NAME", None):
        raise ValueError(f"{cls} sem NAME definido")
    if cls.NAME in _REGISTRY:
        raise ValueError(f"agente '{cls.NAME}' já registrado")
    _REGISTRY[cls.NAME] = cls
    return cls


def get_agent(name: str) -> AgentBase | None:
    """Instancia um agente pelo nome. Retorna None se não existir."""
    cls = _REGISTRY.get(name)
    if cls is None:
        return None
    return cls()


def list_agents() -> list[dict]:
    """Lista metadados de todos agentes registrados."""
    return [
        {
            "name": cls.NAME,
            "model": cls.MODEL,
            "subscribes": list(cls.SUBSCRIBES),
            "cron": cls.CRON,
        }
        for cls in _REGISTRY.values()
    ]


def agents_for_event(event_type: str) -> list[Type[AgentBase]]:
    """Retorna agentes inscritos em um event type (suporta exact + prefixo).

    Match: "signal.commit_realizado" matches SUBSCRIBES=("signal.commit_realizado",) OR ("signal.*",)
    """
    matches = []
    for cls in _REGISTRY.values():
        for pattern in cls.SUBSCRIBES:
            if pattern == event_type:
                matches.append(cls)
                break
            if pattern.endswith(".*") and event_type.startswith(pattern[:-1]):
                matches.append(cls)
                break
    return matches


def _autoload():
    """Importa todos os módulos de agentes para forçar registro.

    Chamado uma vez no startup ou no primeiro list_agents() call.
    """
    # Sonnet workers
    from app.agents.sonnet import memory_writer  # noqa: F401
    from app.agents.sonnet import decay_worker   # noqa: F401
    # Opus workers
    from app.agents.opus import conflict_detector  # noqa: F401


_autoloaded = False


def ensure_loaded():
    global _autoloaded
    if not _autoloaded:
        _autoload()
        _autoloaded = True
