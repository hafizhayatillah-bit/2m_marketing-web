"""admin POS: tabel expenses (biaya operasional untuk laba bersih)

Revision ID: f6a8c0e2b347
Revises: e3b5c7d9f124
Create Date: 2026-11-22 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f6a8c0e2b347'
down_revision: Union[str, Sequence[str], None] = 'e3b5c7d9f124'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'expenses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('spent_on', sa.Date(), nullable=False),
        sa.Column('category', sa.String(40), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('amount > 0', name='ck_expenses_amount_positive'),
    )
    op.create_index('ix_expenses_branch_spent_on', 'expenses', ['branch_id', 'spent_on'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_expenses_branch_spent_on', table_name='expenses')
    op.drop_table('expenses')
