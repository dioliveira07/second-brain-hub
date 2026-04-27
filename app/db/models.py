import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    github_login: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    repos_allowed: Mapped[dict] = mapped_column(JSONB, default=list)
    proactivity_level: Mapped[str] = mapped_column(String(20), default="advisor")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class IndexedRepo(Base):
    __tablename__ = "indexed_repos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_full_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    indexing_status: Mapped[str] = mapped_column(String(20), default="pending")
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_stack: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    directory_map: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    decisions: Mapped[list["ArchitecturalDecision"]] = relationship(back_populates="repo")
    logs: Mapped[list["IndexingLog"]] = relationship(back_populates="repo")


class ArchitecturalDecision(Base):
    __tablename__ = "architectural_decisions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("indexed_repos.id"), index=True)
    pr_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pr_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    impact_areas: Mapped[dict] = mapped_column(JSONB, default=list)
    breaking_changes: Mapped[bool] = mapped_column(Boolean, default=False)
    qdrant_point_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    repo: Mapped["IndexedRepo"] = relationship(back_populates="decisions")


class IndexingLog(Base):
    __tablename__ = "indexing_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("indexed_repos.id"), index=True)
    trigger: Mapped[str] = mapped_column(String(20), nullable=False)
    files_processed: Mapped[int] = mapped_column(Integer, default=0)
    chunks_created: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="running")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    repo: Mapped["IndexedRepo"] = relationship(back_populates="logs")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # None = broadcast
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # stale_pr, dependency_conflict, outdated_docs
    repo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    extra_data: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SessionContext(Base):
    """F6 — Continuidade entre devs. Snapshot da última sessão por dev+projeto."""
    __tablename__ = "session_contexts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dev: Mapped[str] = mapped_column(String(100), nullable=False)
    projeto: Mapped[str] = mapped_column(String(255), nullable=False)
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    arquivos: Mapped[list] = mapped_column(JSONB, default=list)
    ultimo_commit: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    isolated_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)  # se definido, visível só a este dev
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_session_contexts_projeto_timestamp", "projeto", "timestamp"),
    )


class DevSignal(Base):
    """F2/F3 — Sinais de atividade dos devs (erros, edições, skills usadas)."""
    __tablename__ = "dev_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)   # erro_bash | arquivo_editado | skill_usada
    dev: Mapped[str] = mapped_column(String(100), nullable=False)
    projeto: Mapped[str] = mapped_column(String(255), nullable=False)
    dados: Mapped[dict] = mapped_column(JSONB, default=dict)         # payload específico por tipo
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    isolated_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_dev_signals_projeto_tipo_ts", "projeto", "tipo", "ts"),
    )


class SSHIdentity(Base):
    """Identidade de dev por sessão SSH (ip + source_port → dev, TTL 8h)."""
    __tablename__ = "ssh_identities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ssh_ip: Mapped[str] = mapped_column(String(64), nullable=False)
    ssh_port: Mapped[str] = mapped_column(String(10), nullable=False)
    dev: Mapped[str] = mapped_column(String(100), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Statusline stats (atualizados a cada /sbh-auth ou push do statusline)
    ctx_pct: Mapped[int | None] = mapped_column(nullable=True)
    tokens_total: Mapped[int | None] = mapped_column(nullable=True)
    turns: Mapped[int | None] = mapped_column(nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    plan: Mapped[str | None] = mapped_column(String(50), nullable=True)
    projeto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    machine_hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    machine_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ChatMessage(Base):
    """Prompts enviados pelos devs em sessões Claude Code."""
    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("session_id", "turno", "role", name="uq_chat_session_turno_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    dev: Mapped[str] = mapped_column(String(100), nullable=False)
    projeto: Mapped[str] = mapped_column(String(255), nullable=False)
    turno: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    isolated_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LocalDev(Base):
    """Dev registrado localmente — sem GitHub OAuth obrigatório."""
    __tablename__ = "local_devs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA256 hex
    project_scope: Mapped[list] = mapped_column(JSONB, default=list)  # [] = sem restrição
    isolated: Mapped[bool] = mapped_column(Boolean, default=False)     # True = invisível em queries cross-dev
    github_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MCPConnection(Base):
    """Rastreamento de clientes conectados ao MCP server HTTP centralizado."""
    __tablename__ = "mcp_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_ip: Mapped[str] = mapped_column(String(64), nullable=False)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # hostname ou user-agent
    machine: Mapped[str | None] = mapped_column(String(255), nullable=True)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    pending_skills_update: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    skills_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    real_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)  # IP real do TCP (vs client_ip auto-reportado)
    hb_version: Mapped[str | None] = mapped_column(String(32), nullable=True)  # versão do heartbeat instalado
