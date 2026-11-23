"""admin POS: harga jual & modal per cabang (branch_stock.price, branch_stock.cost_price)

Sebelumnya harga & modal ada di products (sama untuk semua cabang). Sekarang tiap cabang punya harga jual dan
modal rata-rata tertimbang sendiri. Nilai awal disalin dari products; products.price tetap dipakai website dan
sebagai harga usulan saat produk ditambahkan ke cabang baru.

Revision ID: a7c9e1f3b582
Revises: f6a8c0e2b347
Create Date: 2026-11-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7c9e1f3b582'
down_revision: Union[str, Sequence[str], None] = 'f6a8c0e2b347'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('branch_stock', sa.Column('price', sa.Integer(), nullable=True))
    op.add_column('branch_stock', sa.Column('cost_price', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE branch_stock bs SET price = p.price, cost_price = p.cost_price "
        "FROM products p WHERE p.id = bs.product_id"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('branch_stock', 'cost_price')
    op.drop_column('branch_stock', 'price')
