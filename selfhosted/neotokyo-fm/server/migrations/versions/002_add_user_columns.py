"""Add user profile columns from _migrate_users_table()

Adds email, email_verified, display_name, avatar_path, and is_active to the
users table — matching the ALTER TABLE statements in db._migrate_users_table().

Revision ID: 002_add_user_columns
Revises: 001_initial_schema
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa

revision = '002_add_user_columns'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('email', sa.Text, server_default=''))
    op.add_column('users', sa.Column('email_verified', sa.Integer, server_default='0'))
    op.add_column('users', sa.Column('display_name', sa.Text, server_default=''))
    op.add_column('users', sa.Column('avatar_path', sa.Text, server_default=''))
    op.add_column('users', sa.Column('is_active', sa.Integer, server_default='1'))


def downgrade():
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'avatar_path')
    op.drop_column('users', 'display_name')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'email')
