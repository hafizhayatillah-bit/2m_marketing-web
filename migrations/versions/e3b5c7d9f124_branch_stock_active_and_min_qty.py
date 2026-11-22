"""admin POS: branch_stock.is_active (jual/sembunyikan per cabang) dan branch_stock.min_qty (batas stok menipis)

Revision ID: e3b5c7d9f124
Revises: d81f4c2a7e90
Create Date: 2026-11-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e3b5c7d9f124'
down_revision: Union[str, Sequence[str], None] = 'd81f4c2a7e90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # products.is_active juga dipakai website marketing, jadi aktif/nonaktif di kiosk disimpan per cabang.
    op.add_column('branch_stock', sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column('branch_stock', sa.Column('min_qty', sa.Integer(), server_default='5', nullable=False))
    op.create_index('ix_stock_movements_type', 'stock_movements', ['type'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_stock_movements_type', table_name='stock_movements')
    op.drop_column('branch_stock', 'min_qty')
    op.drop_column('branch_stock', 'is_active')
