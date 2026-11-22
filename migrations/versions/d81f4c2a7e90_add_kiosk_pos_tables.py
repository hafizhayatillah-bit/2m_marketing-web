"""kiosk: product price/cost/sku, branch_stock, stock_movements, orders, order_items, payments

Revision ID: d81f4c2a7e90
Revises: c47a9e2b6d15
Create Date: 2026-11-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd81f4c2a7e90'
down_revision: Union[str, Sequence[str], None] = 'c47a9e2b6d15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text('now()')


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('products', sa.Column('price', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('cost_price', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('sku', sa.String(), nullable=True))
    op.create_unique_constraint('uq_products_sku', 'products', ['sku'])

    op.create_table(
        'branch_stock',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('qty', sa.Integer(), server_default='0', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.UniqueConstraint('branch_id', 'product_id', name='uq_branch_stock_branch_product'),
    )

    op.create_table(
        'stock_movements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(16), nullable=False),
        sa.Column('qty', sa.Integer(), nullable=False),
        sa.Column('qty_after', sa.Integer(), nullable=True),
        sa.Column('unit_cost', sa.Integer(), nullable=True),
        sa.Column('ref', sa.String(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint("type IN ('in', 'out', 'adjust', 'sale')", name='ck_stock_movements_type'),
    )
    op.create_index('ix_stock_movements_branch_product', 'stock_movements', ['branch_id', 'product_id'])
    op.create_index('ix_stock_movements_created_at', 'stock_movements', ['created_at'])

    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_number', sa.String(32), nullable=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('channel', sa.String(16), server_default='kiosk', nullable=False),
        sa.Column('status', sa.String(20), server_default='PENDING_PAYMENT', nullable=False),
        sa.Column('total', sa.Integer(), nullable=False),
        sa.Column('payment_method', sa.String(16), server_default='QRIS', nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_reason', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.UniqueConstraint('order_number', name='uq_orders_order_number'),
        sa.CheckConstraint(
            "status IN ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED')", name='ck_orders_status'
        ),
    )
    op.create_index('ix_orders_branch_status', 'orders', ['branch_id', 'status'])
    op.create_index('ix_orders_created_at', 'orders', ['created_at'])

    op.create_table(
        'order_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id'), nullable=False),
        sa.Column('product_name', sa.String(), nullable=False),
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('unit_price', sa.Integer(), nullable=False),
        sa.Column('cost_price', sa.Integer(), nullable=True),
        sa.Column('qty', sa.Integer(), nullable=False),
        sa.Column('subtotal', sa.Integer(), nullable=False),
        sa.CheckConstraint('qty > 0', name='ck_order_items_qty_positive'),
    )
    op.create_index('ix_order_items_order_id', 'order_items', ['order_id'])
    op.create_index('ix_order_items_product_id', 'order_items', ['product_id'])

    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(32), nullable=False),
        sa.Column('provider_ref', sa.String(), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(16), server_default='PENDING', nullable=False),
        sa.Column('qr_string', sa.Text(), nullable=True),
        sa.Column('qr_image_url', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('confirmed_by', sa.String(), nullable=True),
        sa.Column('raw_callback', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.UniqueConstraint('provider', 'provider_ref', name='uq_payments_provider_ref'),
        sa.CheckConstraint(
            "status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PAID_LATE')",
            name='ck_payments_status',
        ),
    )
    op.create_index('ix_payments_order_id', 'payments', ['order_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_payments_order_id', table_name='payments')
    op.drop_table('payments')
    op.drop_index('ix_order_items_product_id', table_name='order_items')
    op.drop_index('ix_order_items_order_id', table_name='order_items')
    op.drop_table('order_items')
    op.drop_index('ix_orders_created_at', table_name='orders')
    op.drop_index('ix_orders_branch_status', table_name='orders')
    op.drop_table('orders')
    op.drop_index('ix_stock_movements_created_at', table_name='stock_movements')
    op.drop_index('ix_stock_movements_branch_product', table_name='stock_movements')
    op.drop_table('stock_movements')
    op.drop_table('branch_stock')
    op.drop_constraint('uq_products_sku', 'products', type_='unique')
    op.drop_column('products', 'sku')
    op.drop_column('products', 'cost_price')
    op.drop_column('products', 'price')
