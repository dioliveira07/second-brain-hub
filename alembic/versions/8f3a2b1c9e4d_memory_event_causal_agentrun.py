"""memory + events + causal_edges + agent_runs

Revision ID: 8f3a2b1c9e4d
Revises: ce008abd70ae
Create Date: 2026-04-28 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '8f3a2b1c9e4d'
down_revision: Union[str, None] = 'ce008abd70ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── memories ───────────────────────────────────────────────────────────
    op.create_table(
        'memories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('scope', sa.String(20), nullable=False, server_default='global'),
        sa.Column('scope_ref', sa.String(255), nullable=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('tags', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('confidence', sa.Float, nullable=False, server_default='1.0'),
        sa.Column('access_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('source_type', sa.String(50), nullable=True),
        sa.Column('source_ref', sa.String(255), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('archived_into', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_memories_type_scope_ref', 'memories', ['type', 'scope', 'scope_ref'])
    op.create_index('ix_memories_expires_at', 'memories', ['expires_at'])
    op.create_index('ix_memories_archived', 'memories', ['archived'])

    # ── events ─────────────────────────────────────────────────────────────
    op.create_table(
        'events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('actor', sa.String(255), nullable=True),
        sa.Column('projeto', sa.String(255), nullable=True),
        sa.Column('payload', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('source_table', sa.String(50), nullable=True),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_events_type_ts', 'events', ['type', 'ts'])
    op.create_index('ix_events_projeto_ts', 'events', ['projeto', 'ts'])
    op.create_index('ix_events_actor_ts', 'events', ['actor', 'ts'])
    op.create_index('ix_events_source', 'events', ['source_table', 'source_id'])

    # ── causal_edges ───────────────────────────────────────────────────────
    op.create_table(
        'causal_edges',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('cause_table', sa.String(50), nullable=False),
        sa.Column('cause_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('effect_table', sa.String(50), nullable=False),
        sa.Column('effect_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('relation', sa.String(50), nullable=False),
        sa.Column('confidence', sa.Float, nullable=False, server_default='1.0'),
        sa.Column('detected_by', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('cause_table', 'cause_id', 'effect_table', 'effect_id', 'relation', name='uq_causal_unique'),
    )
    op.create_index('ix_causal_cause', 'causal_edges', ['cause_table', 'cause_id'])
    op.create_index('ix_causal_effect', 'causal_edges', ['effect_table', 'effect_id'])
    op.create_index('ix_causal_relation', 'causal_edges', ['relation'])

    # ── agent_runs ─────────────────────────────────────────────────────────
    op.create_table(
        'agent_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_name', sa.String(100), nullable=False),
        sa.Column('model', sa.String(50), nullable=True),
        sa.Column('trigger_type', sa.String(20), nullable=False),
        sa.Column('trigger_ref', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='running'),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('input', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('output', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('duration_ms', sa.Integer, nullable=True),
        sa.Column('cost_estimate', sa.Float, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_agent_runs_name_started', 'agent_runs', ['agent_name', 'started_at'])
    op.create_index('ix_agent_runs_status', 'agent_runs', ['status'])


def downgrade() -> None:
    op.drop_index('ix_agent_runs_status', table_name='agent_runs')
    op.drop_index('ix_agent_runs_name_started', table_name='agent_runs')
    op.drop_table('agent_runs')

    op.drop_index('ix_causal_relation', table_name='causal_edges')
    op.drop_index('ix_causal_effect', table_name='causal_edges')
    op.drop_index('ix_causal_cause', table_name='causal_edges')
    op.drop_table('causal_edges')

    op.drop_index('ix_events_source', table_name='events')
    op.drop_index('ix_events_actor_ts', table_name='events')
    op.drop_index('ix_events_projeto_ts', table_name='events')
    op.drop_index('ix_events_type_ts', table_name='events')
    op.drop_table('events')

    op.drop_index('ix_memories_archived', table_name='memories')
    op.drop_index('ix_memories_expires_at', table_name='memories')
    op.drop_index('ix_memories_type_scope_ref', table_name='memories')
    op.drop_table('memories')
