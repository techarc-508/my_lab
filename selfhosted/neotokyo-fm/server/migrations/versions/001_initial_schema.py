"""Initial schema — all tables and indexes from init_db() and ensure_indexes()

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('username', sa.Text, unique=True, nullable=False),
        sa.Column('password_hash', sa.Text, nullable=False),
        sa.Column('role', sa.Text, nullable=False, server_default='user'),
        sa.Column('created_at', sa.Text, server_default=sa.text("datetime('now')")),
    )

    # batches
    op.create_table(
        'batches',
        sa.Column('id', sa.Text, primary_key=True),
        sa.Column('label', sa.Text),
        sa.Column('status', sa.Text),
        sa.Column('progress', sa.REAL, server_default='0'),
        sa.Column('completed', sa.Integer, server_default='0'),
        sa.Column('failed', sa.Integer, server_default='0'),
        sa.Column('total', sa.Integer, server_default='0'),
        sa.Column('created', sa.Text),
        sa.Column('save_dir', sa.Text),
        sa.Column('format_opt', sa.Text, server_default='mp3_320'),
        sa.Column('concurrency', sa.Integer, server_default='1'),
        sa.Column('bandwidth_limit', sa.Text, server_default=''),
        sa.Column('tag_title', sa.Text, server_default=''),
        sa.Column('tag_artist', sa.Text, server_default=''),
        sa.Column('webhook', sa.Text, server_default=''),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # playlist_backups
    op.create_table(
        'playlist_backups',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('data', sa.Text, nullable=False),
        sa.Column('version', sa.Integer, nullable=False),
        sa.Column('device', sa.Text, server_default=''),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # batch_files
    op.create_table(
        'batch_files',
        sa.Column('batch_id', sa.Text, nullable=False),
        sa.Column('idx', sa.Integer, nullable=False),
        sa.Column('url', sa.Text),
        sa.Column('filename', sa.Text),
        sa.Column('filename_disk', sa.Text, server_default=''),
        sa.Column('status', sa.Text, server_default='queued'),
        sa.Column('progress_pct', sa.REAL, server_default='0'),
        sa.Column('downloaded', sa.Integer, server_default='0'),
        sa.Column('total_size', sa.Integer, server_default='0'),
        sa.Column('error', sa.Text, server_default=''),
        sa.Column('speed', sa.REAL, server_default='0'),
        sa.Column('eta', sa.Integer, server_default='0'),
        sa.Column('streaming', sa.Integer, server_default='0'),
        sa.Column('title', sa.Text, server_default=''),
        sa.PrimaryKeyConstraint('batch_id', 'idx'),
    )

    # play_log
    op.create_table(
        'play_log',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('title', sa.Text, nullable=False),
        sa.Column('artist', sa.Text, server_default=''),
        sa.Column('album', sa.Text, server_default=''),
        sa.Column('played_at', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('ip', sa.Text, server_default=''),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # visit_log
    op.create_table(
        'visit_log',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('ip', sa.Text, nullable=False),
        sa.Column('username', sa.Text, server_default=''),
        sa.Column('path', sa.Text, server_default='/'),
        sa.Column('visited_at', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # scheduled_backups
    op.create_table(
        'scheduled_backups',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.Text, nullable=False),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # sessions
    op.create_table(
        'sessions',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), nullable=False),
        sa.Column('token_hash', sa.Text, nullable=False),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('expires', sa.Text, nullable=False),
        sa.Column('ip', sa.Text, server_default=''),
    )

    # tracks_fts (FTS5 virtual table — no Alembic support, use raw SQL)
    op.execute('''CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
        filename, title, artist, album, genre,
        content='',
        tokenize='porter unicode61'
    )''')

    # ingestion_log
    op.create_table(
        'ingestion_log',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('filename', sa.Text, nullable=False),
        sa.Column('status', sa.Text, nullable=False, server_default='pending'),
        sa.Column('source', sa.Text, server_default='watch'),
        sa.Column('title', sa.Text, server_default=''),
        sa.Column('artist', sa.Text, server_default=''),
        sa.Column('error', sa.Text, server_default=''),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
    )

    # track_gain
    op.create_table(
        'track_gain',
        sa.Column('filename', sa.Text, primary_key=True),
        sa.Column('track_gain', sa.REAL, server_default='0'),
        sa.Column('track_peak', sa.REAL, server_default='0'),
        sa.Column('album_gain', sa.REAL, server_default='0'),
        sa.Column('album_peak', sa.REAL, server_default='0'),
        sa.Column('album_name', sa.Text, server_default=''),
        sa.Column('analyzed_at', sa.Text, server_default=''),
    )

    # qoe_events
    op.create_table(
        'qoe_events',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('session_id', sa.Text, nullable=False),
        sa.Column('event_type', sa.Text, nullable=False),
        sa.Column('value', sa.REAL, nullable=False),
        sa.Column('metadata', sa.Text, server_default='{}'),
        sa.Column('client_ts', sa.Text, nullable=False),
        sa.Column('server_ts', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('ip', sa.Text, server_default=''),
    )

    # podcasts
    op.create_table(
        'podcasts',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('feed_url', sa.Text, unique=True, nullable=False),
        sa.Column('title', sa.Text, server_default=''),
        sa.Column('description', sa.Text, server_default=''),
        sa.Column('author', sa.Text, server_default=''),
        sa.Column('image_url', sa.Text, server_default=''),
        sa.Column('link', sa.Text, server_default=''),
        sa.Column('category', sa.Text, server_default=''),
        sa.Column('auto_download', sa.Integer, server_default='0'),
        sa.Column('last_synced', sa.Text, server_default=''),
        sa.Column('error', sa.Text, server_default=''),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users(id)'), server_default='1'),
    )

    # podcast_episodes
    op.create_table(
        'podcast_episodes',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('podcast_id', sa.Integer, sa.ForeignKey('podcasts(id)', ondelete='CASCADE'), nullable=False),
        sa.Column('guid', sa.Text, nullable=False),
        sa.Column('title', sa.Text, server_default=''),
        sa.Column('description', sa.Text, server_default=''),
        sa.Column('enclosure_url', sa.Text, server_default=''),
        sa.Column('enclosure_type', sa.Text, server_default=''),
        sa.Column('enclosure_length', sa.Integer, server_default='0'),
        sa.Column('duration', sa.Integer, server_default='0'),
        sa.Column('pub_date', sa.Text, server_default=''),
        sa.Column('image_url', sa.Text, server_default=''),
        sa.Column('link', sa.Text, server_default=''),
        sa.Column('downloaded', sa.Integer, server_default='0'),
        sa.Column('download_path', sa.Text, server_default=''),
        sa.Column('played', sa.Integer, server_default='0'),
        sa.Column('played_at', sa.Text, server_default=''),
        sa.Column('created', sa.Text, server_default=sa.text("datetime('now')")),
        sa.UniqueConstraint('podcast_id', 'guid'),
    )

    # podcast_episode_progress
    op.create_table(
        'podcast_episode_progress',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('episode_id', sa.Integer, sa.ForeignKey('podcast_episodes(id)', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.REAL, server_default='0'),
        sa.Column('duration', sa.REAL, server_default='0'),
        sa.Column('updated_at', sa.Text, server_default=sa.text("datetime('now')")),
        sa.UniqueConstraint('episode_id'),
    )

    # --- Indexes (from ensure_indexes) ---
    op.create_index('idx_play_log_title', 'play_log', ['title'])
    op.create_index('idx_play_log_artist', 'play_log', ['artist'])
    op.create_index('idx_play_log_played_at', 'play_log', ['played_at'])
    op.create_index('idx_visit_log_visited_at', 'visit_log', ['visited_at'])
    op.create_index('idx_batches_status', 'batches', ['status'])
    op.create_index('idx_batches_created', 'batches', ['created'])
    op.create_index('idx_batch_files_batch_id', 'batch_files', ['batch_id'])
    op.create_index('idx_playlist_backups_version', 'playlist_backups', ['version'])
    op.create_index('idx_qoe_event_type', 'qoe_events', ['event_type'])
    op.create_index('idx_sessions_token', 'sessions', ['token_hash'])
    op.create_index('idx_sessions_expires', 'sessions', ['expires'])
    op.create_index('idx_ingestion_status', 'ingestion_log', ['status'])
    op.create_index('idx_podcasts_user', 'podcasts', ['user_id'])
    op.create_index('idx_episodes_podcast', 'podcast_episodes', ['podcast_id'])
    op.create_index('idx_episodes_played', 'podcast_episodes', ['played'])
    op.create_index('idx_track_gain_album', 'track_gain', ['album_name'])
    op.create_index('idx_episode_progress', 'podcast_episode_progress', ['episode_id'])


def downgrade():
    # Indexes
    op.drop_index('idx_episode_progress', 'podcast_episode_progress')
    op.drop_index('idx_track_gain_album', 'track_gain')
    op.drop_index('idx_episodes_played', 'podcast_episodes')
    op.drop_index('idx_episodes_podcast', 'podcast_episodes')
    op.drop_index('idx_podcasts_user', 'podcasts')
    op.drop_index('idx_ingestion_status', 'ingestion_log')
    op.drop_index('idx_sessions_expires', 'sessions')
    op.drop_index('idx_sessions_token', 'sessions')
    op.drop_index('idx_qoe_event_type', 'qoe_events')
    op.drop_index('idx_playlist_backups_version', 'playlist_backups')
    op.drop_index('idx_batch_files_batch_id', 'batch_files')
    op.drop_index('idx_batches_created', 'batches')
    op.drop_index('idx_batches_status', 'batches')
    op.drop_index('idx_visit_log_visited_at', 'visit_log')
    op.drop_index('idx_play_log_played_at', 'play_log')
    op.drop_index('idx_play_log_artist', 'play_log')
    op.drop_index('idx_play_log_title', 'play_log')

    # Tables (reverse dependency order)
    op.execute('DROP TABLE IF EXISTS podcast_episode_progress')
    op.execute('DROP TABLE IF EXISTS podcast_episodes')
    op.execute('DROP TABLE IF EXISTS podcasts')
    op.execute('DROP TABLE IF EXISTS qoe_events')
    op.execute('DROP TABLE IF EXISTS track_gain')
    op.execute('DROP TABLE IF EXISTS ingestion_log')
    op.execute('DROP TABLE IF EXISTS tracks_fts')
    op.execute('DROP TABLE IF EXISTS sessions')
    op.execute('DROP TABLE IF EXISTS scheduled_backups')
    op.execute('DROP TABLE IF EXISTS visit_log')
    op.execute('DROP TABLE IF EXISTS play_log')
    op.execute('DROP TABLE IF EXISTS batch_files')
    op.execute('DROP TABLE IF EXISTS playlist_backups')
    op.execute('DROP TABLE IF EXISTS batches')
    op.execute('DROP TABLE IF EXISTS users')
