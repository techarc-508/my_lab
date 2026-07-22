import logging, random, time, re
from html import unescape
from urllib.parse import quote
from flask import jsonify
from . import analytics_bp
from config import HTTP_SESSION
from models.cache import LRUCache

logger = logging.getLogger('batch_dl')
_cache = LRUCache(maxsize=4, ttl=3600)

SEARCH_QUERIES = ['city pop', 'citypop', 'japanese city pop', 'japan 80s music']

def _clean_html(text):
    return unescape(re.sub(r'<[^>]+>', '', text or '')).strip()

def _fetch_reddit():
    items = []
    try:
        q = random.choice(['city pop', 'citypop'])
        resp = HTTP_SESSION.get(
            f'https://www.reddit.com/r/citypop/search.json?q={quote(q)}&sort=new&limit=15&t=month',
            headers={'User-Agent': 'NEOTOKYOFM/4.0 (radio aggregator)'},
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            for child in (data.get('data', {}).get('children', []) or []):
                d = child.get('data', {})
                if d.get('stickied'):
                    continue
                title = d.get('title', '')
                if not title:
                    continue
                items.append({
                    'title': _clean_html(title),
                    'content': _clean_html(d.get('selftext', ''))[:200] or None,
                    'source': 'Reddit',
                    'source_detail': f"r/{d.get('subreddit', 'citypop')}",
                    'url': f"https://reddit.com{d.get('permalink', '')}",
                    'author': d.get('author', ''),
                    'timestamp': d.get('created_utc', 0),
                })
    except Exception as e:
        logger.warning(f'Reddit fetch failed: {e}')
    return items

def _fetch_google_news():
    items = []
    try:
        import feedparser
        q = random.choice(SEARCH_QUERIES)
        feed = feedparser.parse(f'https://news.google.com/rss/search?q={quote(q)}+when:30d&hl=en')
        for entry in (feed.entries or [])[:15]:
            title = _clean_html(entry.get('title', ''))
            if not title:
                continue
            items.append({
                'title': title,
                'content': _clean_html(entry.get('summary', ''))[:200] or None,
                'source': 'News',
                'source_detail': _clean_html(entry.get('source', {}).get('title', '') if hasattr(entry.get('source', {}), 'get') else ''),
                'url': entry.get('link', ''),
                'author': entry.get('author', ''),
                'timestamp': time.mktime(entry.get('published_parsed', ())) if entry.get('published_parsed') else 0,
            })
    except Exception as e:
        logger.warning(f'Google News fetch failed: {e}')
    return items

def _fetch_all():
    cached = _cache.get('citypop')
    if cached is not None:
        return cached
    items = _fetch_reddit() + _fetch_google_news()
    if items:
        random.shuffle(items)
        _cache.set('citypop', items)
    return items

@analytics_bp.route('/trivia/citypop')
def citypop_trivia():
    try:
        items = _fetch_all()
        sample = random.sample(items, min(8, len(items))) if items else []
        return jsonify({'items': sample, 'total': len(items)})
    except Exception as e:
        return jsonify({'items': [], 'total': 0, 'error': str(e)[:200]}), 500
