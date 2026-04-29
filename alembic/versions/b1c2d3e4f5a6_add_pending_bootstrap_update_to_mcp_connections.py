"""add pending_bootstrap_update to mcp_connections

Revision ID: b1c2d3e4f5a6
Revises: 8f3a2b1c9e4d
Create Date: 2026-04-29 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '8f3a2b1c9e4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mcp_connections',
        sa.Column('pending_bootstrap_update', sa.Boolean(), nullable=False,
                  server_default='false'))


def downgrade() -> None:
    op.drop_column('mcp_connections', 'pending_bootstrap_update')
