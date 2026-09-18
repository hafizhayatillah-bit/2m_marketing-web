"""add tag and excerpt to news

Revision ID: c47a9e2b6d15
Revises: 8f3c1a9d2b4e
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c47a9e2b6d15'
down_revision: Union[str, Sequence[str], None] = '8f3c1a9d2b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('news', sa.Column('tag', sa.String(), nullable=True))
    op.add_column('news', sa.Column('excerpt', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('news', 'excerpt')
    op.drop_column('news', 'tag')
