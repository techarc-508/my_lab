import sqlite3, json, os, hashlib, secrets
from urllib.parse import urlparse
from config import DB_PATH

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=5000')
    return conn

def init_db():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY, label TEXT, status TEXT, progress REAL DEFAULT 0,
        completed INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
        created TEXT, save_dir TEXT, format_opt TEXT DEFAULT 'mp3_320',
        concurrency INTEGER DEFAULT 1, bandwidth_limit TEXT DEFAULT '',
        tag_title TEXT DEFAULT '', tag_artist TEXT DEFAULT '', webhook TEXT DEFAULT '',
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS playlist_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        device TEXT DEFAULT '',
        created TEXT DEFAULT (datetime('now')),
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS batch_files (
        batch_id TEXT, idx INTEGER, url TEXT, filename TEXT,
        filename_disk TEXT DEFAULT '', status TEXT DEFAULT 'queued',
        progress_pct REAL DEFAULT 0, downloaded INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0, error TEXT DEFAULT '',
        speed REAL DEFAULT 0, eta INTEGER DEFAULT 0,
        streaming INTEGER DEFAULT 0, title TEXT DEFAULT '',
        PRIMARY KEY (batch_id, idx)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS play_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT DEFAULT '',
        album TEXT DEFAULT '',
        played_at TEXT DEFAULT (datetime('now')),
        ip TEXT DEFAULT '',
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS visit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        username TEXT DEFAULT '',
        path TEXT DEFAULT '/',
        visited_at TEXT DEFAULT (datetime('now')),
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS scheduled_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created TEXT DEFAULT (datetime('now')),
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        created TEXT DEFAULT (datetime('now')),
        expires TEXT NOT NULL,
        ip TEXT DEFAULT ''
    )''')
    conn.execute('''CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
        filename, title, artist, album, genre,
        content='',
        tokenize='porter unicode61'
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS ingestion_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT DEFAULT 'watch',
        title TEXT DEFAULT '',
        artist TEXT DEFAULT '',
        error TEXT DEFAULT '',
        created TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS track_gain (
        filename TEXT PRIMARY KEY,
        track_gain REAL DEFAULT 0,
        track_peak REAL DEFAULT 0,
        album_gain REAL DEFAULT 0,
        album_peak REAL DEFAULT 0,
        album_name TEXT DEFAULT '',
        analyzed_at TEXT DEFAULT ''
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS oauth_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        created TEXT DEFAULT (datetime('now')),
        UNIQUE(provider, provider_user_id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS qoe_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        value REAL NOT NULL,
        metadata TEXT DEFAULT '{}',
        client_ts TEXT NOT NULL,
        server_ts TEXT DEFAULT (datetime('now')),
        ip TEXT DEFAULT ''
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS podcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_url TEXT UNIQUE NOT NULL,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        author TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        link TEXT DEFAULT '',
        category TEXT DEFAULT '',
        auto_download INTEGER DEFAULT 0,
        last_synced TEXT DEFAULT '',
        error TEXT DEFAULT '',
        created TEXT DEFAULT (datetime('now')),
        user_id INTEGER DEFAULT 1 REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS podcast_episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        podcast_id INTEGER NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
        guid TEXT NOT NULL,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        enclosure_url TEXT DEFAULT '',
        enclosure_type TEXT DEFAULT '',
        enclosure_length INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        pub_date TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        link TEXT DEFAULT '',
        downloaded INTEGER DEFAULT 0,
        download_path TEXT DEFAULT '',
        played INTEGER DEFAULT 0,
        played_at TEXT DEFAULT '',
        created TEXT DEFAULT (datetime('now')),
        UNIQUE(podcast_id, guid)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS podcast_episode_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
        position REAL DEFAULT 0,
        duration REAL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(episode_id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created TEXT DEFAULT (datetime('now'))
    )''')
    conn.commit()
    conn.close()
    ensure_indexes()
    _ensure_admin_user()
    _migrate_users_table()

def ensure_indexes():
    conn = get_db()
    conn.execute('CREATE INDEX IF NOT EXISTS idx_play_log_title ON play_log(title)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_play_log_artist ON play_log(artist)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_play_log_played_at ON play_log(played_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_visit_log_visited_at ON visit_log(visited_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_batch_files_batch_id ON batch_files(batch_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_playlist_backups_version ON playlist_backups(version)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_qoe_event_type ON qoe_events(event_type)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_ingestion_status ON ingestion_log(status)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_podcasts_user ON podcasts(user_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_episodes_podcast ON podcast_episodes(podcast_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_episodes_played ON podcast_episodes(played)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_track_gain_album ON track_gain(album_name)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_episode_progress ON podcast_episode_progress(episode_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token_hash)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)')
    conn.commit()
    conn.close()

def _migrate_users_table():
    conn = get_db()
    migrations = [
        'ALTER TABLE users ADD COLUMN email TEXT DEFAULT \'\'',
        'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0',
        'ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT \'\'',
        'ALTER TABLE users ADD COLUMN avatar_path TEXT DEFAULT \'\'',
        'ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1',
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except Exception:
            pass
    conn.commit()
    conn.close()

def _ensure_admin_user():
    from werkzeug.security import generate_password_hash
    from config import ADMIN_USERNAME, ADMIN_PASSWORD_HASH
    conn = get_db()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (ADMIN_USERNAME,)).fetchone()
    if not existing:
        conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                     (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, 'admin'))
        conn.commit()
    conn.close()

def get_user_by_username(username: str):
    conn = get_db()
    row = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id: int):
    conn = get_db()
    row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def list_users():
    conn = get_db()
    rows = conn.execute('SELECT id, username, role, created_at, email, display_name, avatar_path, is_active FROM users ORDER BY id').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_user(username: str, password_hash: str, role: str = 'user'):
    conn = get_db()
    try:
        cur = conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                          (username, password_hash, role))
        conn.commit()
        return cur.lastrowid
    except Exception as e:
        return None
    finally:
        conn.close()

def update_user_password(user_id: int, password_hash: str):
    conn = get_db()
    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (password_hash, user_id))
    conn.commit()
    conn.close()

def delete_user(user_id: int):
    conn = get_db()
    conn.execute('DELETE FROM users WHERE id = ? AND role != ?', (user_id, 'admin'))
    conn.commit()
    conn.close()

# --- FTS5 Search ---

def upsert_track_fts(filename: str, title: str = '', artist: str = '', album: str = '', genre: str = ''):
    conn = get_db()
    conn.execute('DELETE FROM tracks_fts WHERE filename = ?', (filename,))
    conn.execute('INSERT INTO tracks_fts (filename, title, artist, album, genre) VALUES (?, ?, ?, ?, ?)',
                 (filename, title, artist, album, genre))
    conn.commit()
    conn.close()

def delete_track_fts(filename: str):
    conn = get_db()
    conn.execute('DELETE FROM tracks_fts WHERE filename = ?', (filename,))
    conn.commit()
    conn.close()

def search_tracks_fts(query: str, limit: int = 50) -> list[dict]:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT filename, title, artist, album, genre FROM tracks_fts WHERE tracks_fts MATCH ? ORDER BY rank LIMIT ?",
            (query, limit)
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

# --- Ingestion Log ---

def log_ingestion(filename: str, status: str = 'pending', source: str = 'watch', title: str = '', artist: str = '', error: str = ''):
    conn = get_db()
    conn.execute(
        'INSERT INTO ingestion_log (filename, status, source, title, artist, error) VALUES (?, ?, ?, ?, ?, ?)',
        (filename, status, source, title, artist, error)
    )
    conn.commit()
    conn.close()

def update_ingestion(id: int, status: str, title: str = '', artist: str = '', error: str = ''):
    conn = get_db()
    conn.execute(
        'UPDATE ingestion_log SET status=?, title=?, artist=?, error=? WHERE id=?',
        (status, title, artist, error, id)
    )
    conn.commit()
    conn.close()

def get_recent_ingestions(limit: int = 20):
    conn = get_db()
    rows = conn.execute('SELECT * FROM ingestion_log ORDER BY created DESC LIMIT ?', (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Session management ---

def create_session(user_id: int, ip: str = '') -> str:
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    conn.execute(
        'INSERT INTO sessions (user_id, token_hash, expires, ip) VALUES (?, ?, datetime("now", "+24 hours"), ?)',
        (user_id, token_hash, ip)
    )
    conn.commit()
    conn.close()
    return token

def get_session_by_token(token: str) -> dict | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    row = conn.execute(
        "SELECT s.*, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token_hash = ? AND s.expires > datetime('now') AND u.is_active = 1",
        (token_hash,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(token: str):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE token_hash = ?', (token_hash,))
    conn.commit()
    conn.close()

def clean_expired_sessions():
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE expires <= datetime('now')")
    conn.commit()
    conn.close()

def get_user_sessions(user_id: int) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        'SELECT id, created, expires, ip FROM sessions WHERE user_id = ? ORDER BY created DESC',
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_session_by_id(session_id: int, user_id: int):
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE id = ? AND user_id = ?', (session_id, user_id))
    conn.commit()
    conn.close()

def update_user(user_id: int, **kwargs):
    allowed = {'username', 'role', 'email', 'display_name', 'avatar_path', 'is_active', 'email_verified'}
    sets = {k: v for k, v in kwargs.items() if k in allowed}
    if not sets:
        return
    conn = get_db()
    sets_str = ', '.join(f'{k}=?' for k in sets)
    vals = list(sets.values()) + [user_id]
    conn.execute(f'UPDATE users SET {sets_str} WHERE id=?', vals)
    conn.commit()
    conn.close()

def clear_play_stats():
    conn = get_db()
    conn.execute('DELETE FROM play_log')
    conn.commit()
    conn.close()

# --- OAuth link functions ---

def get_oauth_link(provider: str, provider_user_id: str) -> dict | None:
    conn = get_db()
    row = conn.execute(
        'SELECT * FROM oauth_links WHERE provider = ? AND provider_user_id = ?',
        (provider, provider_user_id)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def link_oauth_account(user_id: int, provider: str, provider_user_id: str):
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO oauth_links (user_id, provider, provider_user_id) VALUES (?, ?, ?)',
            (user_id, provider, provider_user_id)
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()

def create_user_from_oauth(username: str, provider: str, provider_user_id: str) -> int | None:
    from werkzeug.security import generate_password_hash
    import secrets as _secrets
    pw_hash = generate_password_hash(_secrets.token_urlsafe(32))
    uid = create_user(username, pw_hash, 'user')
    if uid is not None:
        link_oauth_account(uid, provider, provider_user_id)
    return uid

def log_play(title: str, artist: str = '', album: str = '', ip: str = '', user_id: int = 1):
    conn = get_db()
    conn.execute('INSERT INTO play_log (title, artist, album, ip, user_id) VALUES (?, ?, ?, ?, ?)',
                 (title[:300], artist[:200], album[:200], ip[:45], user_id))
    conn.commit()
    conn.close()

def log_visit(ip: str, username: str = '', path: str = '/', user_id: int = 1):
    conn = get_db()
    conn.execute('INSERT INTO visit_log (ip, username, path, user_id) VALUES (?, ?, ?, ?)',
                 (ip[:45], username[:64], path[:200], user_id))
    conn.commit()
    conn.close()

def get_most_played(limit: int = 20):
    conn = get_db()
    rows = conn.execute(
        'SELECT title, artist, album, COUNT(*) as play_count, MAX(played_at) as last_played '
        'FROM play_log GROUP BY title ORDER BY play_count DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_top_artists(limit: int = 20):
    conn = get_db()
    rows = conn.execute(
        'SELECT artist, COUNT(*) as play_count, MAX(played_at) as last_played '
        'FROM play_log WHERE artist != "" GROUP BY artist ORDER BY play_count DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_recent_plays(limit: int = 30):
    conn = get_db()
    rows = conn.execute(
        'SELECT title, artist, album, played_at, ip FROM play_log ORDER BY played_at DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_recent_visits(limit: int = 30):
    conn = get_db()
    rows = conn.execute(
        'SELECT ip, username, path, visited_at FROM visit_log ORDER BY visited_at DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_scheduled_backup(name: str):
    conn = get_db()
    conn.execute('INSERT INTO scheduled_backups (name) VALUES (?)', (name[:100],))
    conn.execute('DELETE FROM scheduled_backups WHERE id NOT IN (SELECT id FROM scheduled_backups ORDER BY id DESC LIMIT 50)')
    conn.commit()
    conn.close()

def get_scheduled_backups():
    conn = get_db()
    rows = conn.execute('SELECT id, name, created FROM scheduled_backups ORDER BY created DESC LIMIT 50').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_batch_to_db(entry):
    webhook_url = entry.get('webhook', '')
    if webhook_url:
        parsed = urlparse(webhook_url)
        if parsed.scheme not in ('http', 'https'):
            webhook_url = ''
    conn = get_db()
    conn.execute('''INSERT OR REPLACE INTO batches (id,label,status,progress,completed,failed,total,created,save_dir,format_opt,concurrency,bandwidth_limit,tag_title,tag_artist,webhook) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (entry['id'], entry['label'], entry['status'], entry['progress'],
         entry['completed'], entry['failed'], entry['total'],
         entry['created'], entry['save_dir'],
         entry.get('format_opt','mp3_320'), entry.get('concurrency',1),
         entry.get('bandwidth_limit',''),
         entry.get('tag_title',''), entry.get('tag_artist',''), webhook_url))
    for idx, f in enumerate(entry['files']):
        conn.execute('INSERT OR REPLACE INTO batch_files (batch_id,idx,url,filename,filename_disk,status,progress_pct,downloaded,total_size,error,speed,eta,streaming,title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (entry['id'], idx, f['url'], f.get('filename',''), f.get('filename_disk',''),
             f['status'], f.get('progress_pct',0), f.get('downloaded',0),
             f.get('total_size',0), f.get('error',''), f.get('speed',0),
             f.get('eta',0), 1 if f.get('streaming') else 0, f.get('title','')))
    conn.commit()
    conn.close()

def load_all_from_db():
    conn = get_db()
    rows = conn.execute('SELECT * FROM batches ORDER BY created DESC').fetchall()
    result = []
    for r in rows:
        id_ = r['id']
        frows = conn.execute('SELECT * FROM batch_files WHERE batch_id=? ORDER BY idx', (id_,)).fetchall()
        files = [dict(f) for f in frows]
        for f in files:
            f['streaming'] = bool(f['streaming'])
            del f['batch_id']; del f['idx']
        def rget(key, default=''):
            try: return r[key]
            except (KeyError, IndexError): return default
        result.append({
            'id': id_, 'label': r['label'], 'status': r['status'],
            'progress': r['progress'], 'completed': r['completed'],
            'failed': r['failed'], 'total': r['total'], 'created': r['created'],
            'save_dir': r['save_dir'],
            'format_opt': r['format_opt'], 'concurrency': r['concurrency'],
            'bandwidth_limit': r['bandwidth_limit'],
            'tag_title': rget('tag_title'), 'tag_artist': rget('tag_artist'),
            'webhook': rget('webhook'),
            'files': files
        })
    conn.close()
    return result

def load_active_batches():
    conn = get_db()
    rows = conn.execute("SELECT * FROM batches WHERE status NOT IN ('done', 'cancelled', 'failed')").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_playlist_backup(data, version, device=''):
    if len(device) > 64:
        device = device[:64]
    conn = get_db()
    conn.execute('INSERT INTO playlist_backups (data, version, device) VALUES (?, ?, ?)',
                 (json.dumps(data), version, device))
    conn.execute('''DELETE FROM playlist_backups WHERE id NOT IN (
        SELECT id FROM playlist_backups ORDER BY version DESC LIMIT 10
    )''')
    conn.commit()
    conn.close()

def get_latest_backup():
    conn = get_db()
    row = conn.execute('SELECT id, data, version, created FROM playlist_backups ORDER BY version DESC LIMIT 1').fetchone()
    conn.close()
    return row

def list_backups():
    conn = get_db()
    rows = conn.execute('SELECT id, version, device, created FROM playlist_backups ORDER BY version DESC').fetchall()
    conn.close()
    return rows

def get_backup(backup_id):
    conn = get_db()
    row = conn.execute('SELECT data FROM playlist_backups WHERE id = ?', (backup_id,)).fetchone()
    conn.close()
    return row

def delete_backup(backup_id):
    conn = get_db()
    cursor = conn.execute('DELETE FROM playlist_backups WHERE id = ?', (backup_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted > 0

def insert_qoe_events(events: list[dict], ip: str = ''):
    conn = get_db()
    conn.executemany(
        'INSERT INTO qoe_events (session_id, event_type, value, metadata, client_ts, ip) VALUES (?, ?, ?, ?, ?, ?)',
        [(e['session_id'], e['event_type'], e['value'], json.dumps(e.get('metadata', {})), e['client_ts'], ip) for e in events]
    )
    conn.commit()
    conn.close()

# --- Podcast helpers ---

def add_podcast(feed_url: str, title: str = '', description: str = '', author: str = '',
                image_url: str = '', link: str = '', category: str = '', user_id: int = 1) -> int | None:
    conn = get_db()
    try:
        cur = conn.execute(
            'INSERT INTO podcasts (feed_url, title, description, author, image_url, link, category, user_id) VALUES (?,?,?,?,?,?,?,?)',
            (feed_url, title[:500], description[:2000], author[:200], image_url[:500], link[:500], category[:100], user_id)
        )
        conn.commit()
        return cur.lastrowid
    except Exception:
        return None
    finally:
        conn.close()

def list_podcasts(user_id: int = 0, category: str = '') -> list[dict]:
    conn = get_db()
    query = 'SELECT * FROM podcasts'
    params = []
    conditions = []
    if user_id:
        conditions.append('user_id = ?')
        params.append(user_id)
    if category:
        conditions.append('category = ?')
        params.append(category)
    if conditions:
        query += ' WHERE ' + ' AND '.join(conditions)
    query += ' ORDER BY title COLLATE NOCASE'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        ep = get_db()
        unplayed = ep.execute('SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ? AND played = 0', (d['id'],)).fetchone()[0]
        total = ep.execute('SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ?', (d['id'],)).fetchone()[0]
        ep.close()
        d['unplayed'] = unplayed
        d['episode_count'] = total
        result.append(d)
    return result

def get_podcast(podcast_id: int) -> dict | None:
    conn = get_db()
    row = conn.execute('SELECT * FROM podcasts WHERE id = ?', (podcast_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        ep = get_db()
        unplayed = ep.execute('SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ? AND played = 0', (d['id'],)).fetchone()[0]
        total = ep.execute('SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ?', (d['id'],)).fetchone()[0]
        ep.close()
        d['unplayed'] = unplayed
        d['episode_count'] = total
        return d
    return None

def delete_podcast(podcast_id: int) -> bool:
    conn = get_db()
    conn.execute('DELETE FROM podcast_episodes WHERE podcast_id = ?', (podcast_id,))
    conn.execute('DELETE FROM podcasts WHERE id = ?', (podcast_id,))
    affected = conn.total_changes
    conn.commit()
    conn.close()
    return affected > 0

def update_podcast(podcast_id: int, **kwargs):
    allowed = {'title', 'description', 'author', 'image_url', 'link', 'category', 'auto_download', 'last_synced', 'error'}
    sets = {k: v for k, v in kwargs.items() if k in allowed}
    if not sets:
        return
    conn = get_db()
    sets_str = ', '.join(f'{k}=?' for k in sets)
    vals = list(sets.values()) + [podcast_id]
    conn.execute(f'UPDATE podcasts SET {sets_str} WHERE id=?', vals)
    conn.commit()
    conn.close()

def add_podcast_episode(podcast_id: int, guid: str, title: str = '', description: str = '',
                         enclosure_url: str = '', enclosure_type: str = '', enclosure_length: int = 0,
                         duration: int = 0, pub_date: str = '', image_url: str = '', link: str = '') -> int | None:
    conn = get_db()
    try:
        cur = conn.execute(
            '''INSERT OR IGNORE INTO podcast_episodes
               (podcast_id, guid, title, description, enclosure_url, enclosure_type, enclosure_length, duration, pub_date, image_url, link)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (podcast_id, guid[:500], title[:500], description[:2000],
             enclosure_url[:1000], enclosure_type[:100], enclosure_length,
             duration, pub_date[:50], image_url[:500], link[:500])
        )
        conn.commit()
        return cur.lastrowid
    except Exception:
        return None
    finally:
        conn.close()

def list_episodes(podcast_id: int, limit: int = 100, offset: int = 0) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM podcast_episodes WHERE podcast_id = ? ORDER BY pub_date DESC, id DESC LIMIT ? OFFSET ?',
        (podcast_id, limit, offset)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_episode(episode_id: int) -> dict | None:
    conn = get_db()
    row = conn.execute('SELECT * FROM podcast_episodes WHERE id = ?', (episode_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def mark_episode_played(episode_id: int):
    conn = get_db()
    conn.execute("UPDATE podcast_episodes SET played = 1, played_at = datetime('now') WHERE id = ?", (episode_id,))
    conn.commit()
    conn.close()

def mark_episode_downloaded(episode_id: int, download_path: str):
    conn = get_db()
    conn.execute('UPDATE podcast_episodes SET downloaded = 1, download_path = ? WHERE id = ?', (download_path, episode_id))
    conn.commit()
    conn.close()

def search_podcasts(query: str, user_id: int = 0) -> list[dict]:
    conn = get_db()
    like = f'%{query}%'
    if user_id:
        rows = conn.execute(
            "SELECT * FROM podcasts WHERE user_id = ? AND (title LIKE ? OR description LIKE ? OR author LIKE ?) ORDER BY title COLLATE NOCASE",
            (user_id, like, like, like)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM podcasts WHERE title LIKE ? OR description LIKE ? OR author LIKE ? ORDER BY title COLLATE NOCASE",
            (like, like, like)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_podcast_feed_urls() -> list[tuple[int, str]]:
    conn = get_db()
    rows = conn.execute('SELECT id, feed_url FROM podcasts').fetchall()
    conn.close()
    return [(r['id'], r['feed_url']) for r in rows]

def get_podcast_categories() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        'SELECT category, COUNT(*) as count FROM podcasts WHERE category != "" GROUP BY category ORDER BY category'
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_episode_progress(episode_id: int) -> dict | None:
    conn = get_db()
    row = conn.execute('SELECT * FROM podcast_episode_progress WHERE episode_id = ?', (episode_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def set_episode_progress(episode_id: int, position: float, duration: float):
    conn = get_db()
    conn.execute(
        '''INSERT INTO podcast_episode_progress (episode_id, position, duration, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(episode_id) DO UPDATE SET position=?, duration=?, updated_at=datetime('now')''',
        (episode_id, position, duration, position, duration)
    )
    conn.commit()
    conn.close()

def clear_episode_progress(episode_id: int):
    conn = get_db()
    conn.execute('DELETE FROM podcast_episode_progress WHERE episode_id = ?', (episode_id,))
    conn.commit()
    conn.close()

def get_track_gain(filename: str) -> dict | None:
    conn = get_db()
    row = conn.execute('SELECT * FROM track_gain WHERE filename = ?', (filename,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_album_gains(album_name: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute('SELECT * FROM track_gain WHERE album_name = ?', (album_name,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def set_track_gain(filename: str, track_gain: float = 0, track_peak: float = 0,
                    album_gain: float = 0, album_peak: float = 0, album_name: str = ''):
    conn = get_db()
    conn.execute('''INSERT OR REPLACE INTO track_gain
        (filename, track_gain, track_peak, album_gain, album_peak, album_name, analyzed_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))''',
        (filename, track_gain, track_peak, album_gain, album_peak, album_name))
    conn.commit()
    conn.close()

def get_all_gain_tracks() -> list[dict]:
    conn = get_db()
    rows = conn.execute('SELECT * FROM track_gain ORDER BY filename').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def wal_checkpoint():
    try:
        with sqlite3.connect(DB_PATH, timeout=5) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            conn.execute("VACUUM;")
    except Exception as e:
        import logging
        logging.warning(f"DB maintenance failed: {e}")

# --- Password reset tokens ---

def create_password_reset_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    conn.execute(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires) VALUES (?, ?, datetime('now', '+1 hour'))",
        (user_id, token_hash)
    )
    conn.commit()
    conn.close()
    return token

def validate_password_reset_token(token: str) -> int | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    row = conn.execute(
        "SELECT user_id FROM password_reset_tokens "
        "WHERE token_hash = ? AND used = 0 AND expires > datetime('now')",
        (token_hash,)
    ).fetchone()
    conn.close()
    return row['user_id'] if row else None

def invalidate_password_reset_token(token: str):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    conn = get_db()
    conn.execute('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?', (token_hash,))
    conn.commit()
    conn.close()
