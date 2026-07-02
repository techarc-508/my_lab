import sqlite3, json, os
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
    conn.execute('''CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY, label TEXT, status TEXT, progress REAL DEFAULT 0,
        completed INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
        created TEXT, save_dir TEXT, format_opt TEXT DEFAULT 'mp3_320',
        concurrency INTEGER DEFAULT 1, bandwidth_limit TEXT DEFAULT '',
        tag_title TEXT DEFAULT '', tag_artist TEXT DEFAULT '', webhook TEXT DEFAULT ''
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS playlist_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        device TEXT DEFAULT '',
        created TEXT DEFAULT (datetime('now'))
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
        ip TEXT DEFAULT ''
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS visit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        username TEXT DEFAULT '',
        path TEXT DEFAULT '/',
        visited_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS scheduled_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created TEXT DEFAULT (datetime('now'))
    )''')
    conn.commit()
    conn.close()

def clear_play_stats():
    conn = get_db()
    conn.execute('DELETE FROM play_log')
    conn.commit()
    conn.close()

def log_play(title: str, artist: str = '', album: str = '', ip: str = ''):
    conn = get_db()
    conn.execute('INSERT INTO play_log (title, artist, album, ip) VALUES (?, ?, ?, ?)',
                 (title[:300], artist[:200], album[:200], ip[:45]))
    conn.commit()
    conn.close()

def log_visit(ip: str, username: str = '', path: str = '/'):
    conn = get_db()
    conn.execute('INSERT INTO visit_log (ip, username, path) VALUES (?, ?, ?)',
                 (ip[:45], username[:64], path[:200]))
    conn.execute('DELETE FROM visit_log WHERE id NOT IN (SELECT id FROM visit_log ORDER BY id DESC LIMIT 500)')
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

def wal_checkpoint():
    try:
        with sqlite3.connect(DB_PATH, timeout=5) as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            conn.execute("VACUUM;")
    except Exception as e:
        import logging
        logging.warning(f"DB maintenance failed: {e}")
