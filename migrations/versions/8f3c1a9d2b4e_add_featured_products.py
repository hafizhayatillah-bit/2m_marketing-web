"""add featured_products table

Revision ID: 8f3c1a9d2b4e
Revises: 5735558e902a
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8f3c1a9d2b4e'
down_revision: Union[str, Sequence[str], None] = '5735558e902a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'featured_products',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_featured_products_position', 'featured_products', ['position'])
    op.create_index('ix_featured_products_is_active', 'featured_products', ['is_active'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_featured_products_is_active', table_name='featured_products')
    op.drop_index('ix_featured_products_position', table_name='featured_products')
    op.drop_table('featured_products')
