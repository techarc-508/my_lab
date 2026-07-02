import requests, logging, os, threading, time, re, html, json
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout
from config import LRCLIB_TIMEOUT, LRCLIB_SKIP, HTTP_SESSION, METADATA_DIR
from urllib.parse import quote

_lrclib_failures = 0
_lrclib_max_failures = 10
_lrclib_disabled = False
_lrclib_disabled_at = 0.0
_lrclib_cooldown = 300
_lrclib_lock = threading.Lock()

logger = logging.getLogger('batch_dl')

_LRCLIB_TIMEOUT = 12
_TOTAL_TIMEOUT = 25.0
_CACHE_TTL = 1800

_lyrics_cache = {}
_cache_lock = threading.Lock()


def clear_lyrics_cache(basename: str) -> None:
    with _cache_lock:
        _lyrics_cache.pop(basename, None)

_SCRAPER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

_CHANNEL_SUFFIXES = [
    't-series', 't series', 'sony music india', 'sony music', 'zee music company',
    'zee music', 'tips official', 'tips', 'svf', 'surinder films', 'eskay movies',
    'saregama music', 'saregama', 'yrf', 'times music', 'speed records',
    'venus music', 'tips music', 'music india', 'universal music india',
    'warner music india', 'junglee music', 'nehhaflix', 'trending music',
    'viral music', 'djmaza', 'svf music',
    'tseries', 'sonymusicindia', 'zeemusiccompany', 'tipsmusic',
    'saregamaindia', 'timesmusicindia',
    'chiefsworld', 'chiefsworld dj lemon mixs', 'chiefsworld india remix',
    'dj lemon official', 'dj lemon exclusive', 'dj pritam official',
]

_YOUTUBE_SUFFIXES = [
    r'\(.*?official.*?\)', r'\(.*?video.*?\)', r'\(.*?lyric.*?\)', r'\(.*?audio.*?\)',
    r'\(.*?lyrical.*?\)', r'\(.*?hd.*?\)', r'\(.*?4k.*?\)', r'\(.*?1080p.*?\)',
    r'\(.*?\d+p.*?\)', r'\(.*?hq.*?\)', r'\(.*?cover.*?\)',
    r'\[.*?official.*?\]', r'\[.*?video.*?\]', r'\[.*?lyric.*?\]', r'\[.*?audio.*?\]',
    r'\[.*?hd.*?\]', r'\[.*?hq.*?\]', r'\[.*?4k.*?\]', r'\[.*?\d+p.*?\]',
    r'\|.*?(lyrical|lyric|official|video|audio)', r'-.*?(lyrical|lyric|official|video|audio)',
    r'lyrical video', r'full video song', r'full song', r'full video',
    r'official music video', r'official video', r'official audio',
    r'with lyrics', r'lyrics',
]

_CREDIT_KEYWORDS = (
    'dj ', 'remix', 'exclusive', 'programmed', 'arranged', 'produced', 'mixed',
    'presented', 'cover by', 'cover of', 'feat', 'ft.', 'presents', 'presents ',
    'mashup', 'edit', 'version', 'rework', 'bootleg', 'tribute', 'original',
    'instrumental', 'karaoke', 'acoustic', 'unplugged', 'live', 'reverb',
    'speed up', 'nightcore', 'extended', 'radio edit', 'club mix', 'mix',
    'slowed', 'reverbed', 'slowed reverb', 'lofi', 'lo fi',
)


def _clean_title(title: str) -> str:
    """Aggressively clean YouTube-derived titles to extract the real song name."""
    if not title:
        return ''
    t = title.strip()

    # Strip file extensions
    t = re.sub(r'\.(mp3|mp4|webm|m4a|flac|ogg|wav|opus)$', '', t, flags=re.IGNORECASE)

    # Strip leading track numbers: "01 ", "01.", "01-", "02 ", "05 ", "#1 ", etc.
    t = re.sub(r'^(?:\d+\s*[).\-]?\s*)+', '', t).strip()
    t = re.sub(r'^#\d+\s*', '', t).strip()

    # Handle pipe separators – take the first segment (song name)
    if '|' in t or '||' in t:
        parts = re.split(r'\|\|?', t)
        parts = [p.strip() for p in parts if p.strip()]
        if parts:
            t = parts[0]

    # Strip trailing metadata after " – ", " — ", " - " patterns
    t = re.sub(
        r'\s*[-–—]\s*(?:Lyrical\s*(?:Video)?|Full\s*(?:Song|Video)|'
        r'Official\s*(?:Music\s*)?Video|Official\s*Audio|'
        r'With\s*Lyrics|FREE\s*DOWNLOAD|8K\s*Video|HD\s*Video|'
        r'Video Song|Song Video)\b.*$',
        '', t, flags=re.IGNORECASE
    )

    # Strip parenthetical/bracketed credit keywords
    credit_words_flat = [w for w in _CREDIT_KEYWORDS if ' ' not in w]
    t = re.sub(
        r'\([^)]*(?:' + '|'.join(re.escape(w) for w in credit_words_flat) + r')[^)]*\)',
        '', t, flags=re.IGNORECASE
    )
    t = re.sub(
        r'\[[^\]]*(?:' + '|'.join(re.escape(w) for w in credit_words_flat) + r')[^\]]*\]',
        '', t, flags=re.IGNORECASE
    )

    # Strip credit/remix info after " - " patterns
    credit_pat = (
        r'\s*[-–—]\s*(?:' +
        '|'.join(re.escape(kw) for kw in _CREDIT_KEYWORDS) +
        r')\b.*$'
    )
    t = re.sub(credit_pat, '', t, flags=re.IGNORECASE)

    # Strip channel name suffixes at the end
    for suffix in _CHANNEL_SUFFIXES:
        t = re.sub(
            rf'\s*[-–—|]\s*{re.escape(suffix)}\s*$',
            '', t, flags=re.IGNORECASE
        )
        if t.lower().endswith(' ' + suffix):
            t = t[:-len(' ' + suffix)].strip()
        elif t.lower().endswith(suffix):
            t = t[:-len(suffix)].strip()

    # Apply existing YouTube suffix regex patterns
    for pat in _YOUTUBE_SUFFIXES:
        t = re.sub(pat, '', t, flags=re.IGNORECASE)

    # Remove double pipes and surrounding whitespace
    t = re.sub(r'\s*\|\|\s*', ' ', t)

    # Clean up whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    t = t.strip(' -|,;:!?\'"')

    return t if t and len(t) > 1 else title.strip()


def _clean_artist(artist: str) -> str:
    """Strip channel names from artist field to extract real artist name."""
    if not artist:
        return ''
    a = artist.strip()

    # Strip generic suffixes first
    a = re.sub(
        r'\s*(?:Official(?: Channel)?|Music|Company|Entertainment|'
        r'VEVO|Channel|India|Mixs?|Mixes|Remix(?:es)?)\s*$',
        '', a, flags=re.IGNORECASE
    ).strip()

    # Then check if result is a known channel name
    a_lower = a.lower()
    for suffix in _CHANNEL_SUFFIXES:
        if a_lower == suffix or a_lower.endswith(' ' + suffix) or a_lower.startswith(suffix + ' '):
            return ''

    # If the result has many credit-style words, it's likely a channel/label
    words = a.split()
    credit_indicators = {'dj', 'remix', 'mixes', 'mixs', 'official', 'music',
                         'india', 'world', 'records', 'entertainment', 'label',
                         'company', 'production', 'music company'}
    if len(words) >= 3:
        match_count = sum(1 for w in words if w.lower() in credit_indicators)
        if match_count >= 2:
            return ''

    return a


def _extract_artist_title_from_filename(basename: str):
    """Try to extract title from filename. Artist extraction is unreliable from
    YouTube-derived filenames, so we focus on getting a clean title."""
    name = re.sub(r'\.(mp3|mp4|webm|m4a|flac|ogg|wav|opus)$', '', basename, flags=re.IGNORECASE)
    name = name.replace('_', ' ')
    return None, name.strip()


def _slug_azlyrics(text: str) -> str:
    """Convert text to AZLyrics URL slug (lowercase, alphanumeric only)."""
    return re.sub(r'[^a-z0-9]', '', text.lower())


def _slug_letras(text: str) -> str:
    """Convert text to letras.mus.br URL slug (lowercase, spaces to dashes)."""
    text = re.sub(r'[^a-z0-9\s]', '', text.lower())
    return re.sub(r'\s+', '-', text).strip('-')


def _search_lrclib(title: str, artist: str = '') -> str | None:
    """Search LRCLIB with various strategies, return LRC text or None."""
    if not title:
        return None

    strategies = []

    if artist:
        strategies.append({'track_name': title, 'artist_name': artist})
    q = f'{title} {artist}'.strip()
    if q:
        strategies.append({'q': q})
    strategies.append({'q': title})

    parts = re.split(r'\s*[|–—\-;]\s*', title)
    for part in parts:
        p = part.strip()
        if len(p) > 4 and p != title:
            strategies.append({'q': p})
            if artist:
                strategies.append({'track_name': p, 'artist_name': artist})

    dead = time.monotonic() + _LRCLIB_TIMEOUT
    tried = set()
    for params in strategies:
        if time.monotonic() > dead:
            break
        key = str(params)
        if key in tried:
            continue
        tried.add(key)

        remaining = max(2, dead - time.monotonic())
        url = (
            'https://lrclib.net/api/get'
            if 'track_name' in params
            else 'https://lrclib.net/api/search'
        )
        try:
            resp = HTTP_SESSION.get(
                url, params=params, timeout=min(_LRCLIB_TIMEOUT, remaining)
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    result = data[0]
                elif isinstance(data, dict):
                    result = data
                else:
                    continue
                lrc = result.get('syncedLyrics') or result.get('plainLyrics') or ''
                if lrc:
                    return lrc
        except (requests.RequestException, ValueError):
            continue

    return None


def _scrape_genius(title: str, artist: str) -> str | None:
    """Scrape lyrics from Genius as a fallback. Returns plain text or None."""
    q = f'{artist} {title}'.strip()
    if not q:
        return None
    try:
        search_url = 'https://genius.com/api/search/song'
        resp = HTTP_SESSION.get(
            search_url, params={'q': q}, timeout=_LRCLIB_TIMEOUT
        )
        if resp.status_code != 200:
            return None
        hits = resp.json().get('response', {}).get('sections', [])
        for section in hits:
            for hit in section.get('hits', []):
                song_url = hit.get('result', {}).get('url', '')
                if not song_url:
                    continue
                page = HTTP_SESSION.get(
                    song_url, timeout=_LRCLIB_TIMEOUT, headers=_SCRAPER_HEADERS
                )
                if page.status_code != 200:
                    continue
                lyrics = ''
                for match in re.finditer(
                    r'<div[^>]*data-lyrics-container="true"[^>]*>(.*?)</div>',
                    page.text, re.DOTALL
                ):
                    lyrics += match.group(1) + '\n'
                if lyrics:
                    lyrics = re.sub(r'<[^>]+>', '', lyrics)
                    lyrics = html.unescape(lyrics).strip()
                    if lyrics:
                        return lyrics
    except Exception:
        pass
    return None


def _scrape_azlyrics(title: str, artist: str) -> str | None:
    """Scrape AZLyrics for lyrics."""
    if not title or not artist:
        return None
    try:
        artist_slug = _slug_azlyrics(artist)
        title_slug = _slug_azlyrics(title)
        if not artist_slug or not title_slug:
            return None

        url = f'https://www.azlyrics.com/lyrics/{artist_slug}/{title_slug}.html'
        resp = HTTP_SESSION.get(url, timeout=_LRCLIB_TIMEOUT, headers=_SCRAPER_HEADERS)
        if resp.status_code != 200:
            return None

        text = resp.text
        lyrics_section = None

        # Method 1: Comment markers
        start_marker = '<!-- start of lyrics -->'
        end_marker = '<!-- end of lyrics -->'
        si = text.find(start_marker)
        ei = text.find(end_marker)
        if si != -1 and ei != -1:
            lyrics_section = text[si + len(start_marker):ei]
        else:
            # Method 2: Look for ringtone link + following div pattern
            m = re.search(
                r'(?:ringtone|class="[^"]*lyrics[^"]*")'
                r'.*?<div[^>]*>(.*?)</div>\s*$',
                text, re.DOTALL | re.IGNORECASE
            )
            if m:
                lyrics_section = m.group(1)

        if not lyrics_section:
            return None

        lyrics_section = re.sub(r'<br\s*/?>', '\n', lyrics_section)
        lyrics_section = re.sub(r'<[^>]+>', '', lyrics_section)
        lyrics_section = html.unescape(lyrics_section).strip()
        lyrics_section = re.sub(r'\n{3,}', '\n\n', lyrics_section)

        return lyrics_section if lyrics_section else None
    except Exception:
        return None


def _scrape_lyrics_ovh(title: str, artist: str) -> str | None:
    """Try lyrics.ovh API as a fallback."""
    if not artist or not title:
        return None
    try:
        url = (
            f'https://api.lyrics.ovh/v1/'
            f'{requests.utils.quote(artist)}/{requests.utils.quote(title)}'
        )
        resp = HTTP_SESSION.get(url, timeout=_LRCLIB_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            lyrics = data.get('lyrics', '')
            if lyrics and 'Paroles de la chanson' not in lyrics:
                return lyrics
    except Exception:
        pass
    return None


def _scrape_letras(title: str, artist: str) -> str | None:
    """Scrape letras.mus.br for lyrics – good for Brazilian/Indian songs."""
    if not title or not artist:
        return None
    try:
        artist_slug = _slug_letras(artist)
        title_slug = _slug_letras(title)
        if not artist_slug or not title_slug:
            return None

        url = f'https://www.letras.mus.br/{artist_slug}/{title_slug}/'
        resp = HTTP_SESSION.get(url, timeout=_LRCLIB_TIMEOUT, headers=_SCRAPER_HEADERS)
        if resp.status_code != 200:
            return None

        text = resp.text
        lyrics_section = None

        patterns = [
            r'<div[^>]*class="[^"]*\bcnt-letra\b[^"]*"[^>]*>(.*?)</div>\s*</div>',
            r'<div[^>]*class="[^"]*\bletra\b[^"]*"[^>]*>(.*?)</div>',
            r'<div[^>]*id="letra"[^>]*>(.*?)</div>',
        ]
        for pat in patterns:
            m = re.search(pat, text, re.DOTALL)
            if m:
                lyrics_section = m.group(1)
                break

        if not lyrics_section:
            return None

        lyrics_section = re.sub(r'<br\s*/?>', '\n', lyrics_section)
        lyrics_section = re.sub(r'<[^>]+>', '', lyrics_section)
        lyrics_section = html.unescape(lyrics_section).strip()
        lyrics_section = re.sub(r'\n{3,}', '\n\n', lyrics_section)

        return lyrics_section if lyrics_section else None
    except Exception:
        return None


def _scrape_bangla_lyrics(title: str, artist: str, original_basename: str = '') -> str | None:
    """Scrape bangla-lyrics.com for Bengali song lyrics."""
    if not title and not original_basename:
        return None
    try:
        import urllib.parse

        # Collect search terms from multiple sources
        search_terms = set()
        if title:
            search_terms.add(title.strip())
        if original_basename:
            # Add the cleaned basename (without extension)
            base = re.sub(r'\.(mp3|mp4|webm|m4a|flac|ogg|wav|opus)$', '', original_basename, flags=re.IGNORECASE)
            search_terms.add(base.strip())
            # Extract Bengali text from the original filename
            bengali_blocks = re.findall(r'[\u0980-\u09FF]+(?:\s*[\u0980-\u09FF]+)*', base)
            for block in bengali_blocks:
                b = block.strip()
                if len(b) > 3:  # At least a few characters
                    search_terms.add(b)
            # Also try text immediately before Bengali blocks ("Thik Emon Ebhabe" from "...Thik Emon Ebhabe (ঠিক...)")
            for m in re.finditer(r'([A-Za-z][A-Za-z\s]+?)\s*\([\u0980-\u09FF]', base):
                prefix = m.group(1).strip()
                if prefix:
                    search_terms.add(prefix)

        if not search_terms:
            return None

        best_link = None
        best_score = -1

        for term in search_terms:
            try:
                q = urllib.parse.quote(term)
                url = f'https://bangla-lyrics.com/?s={q}'
                resp = HTTP_SESSION.get(url, timeout=_LRCLIB_TIMEOUT, headers=_SCRAPER_HEADERS)
                if resp.status_code != 200:
                    continue

                links = re.findall(
                    r'<h2 class="wp-block-post-title"><a href="([^"]+)"[^>]*>([^<]+)</a></h2>',
                    resp.text
                )
                if not links:
                    continue

                term_lower = term.lower().strip()
                for link, link_title in links:
                    lt = re.sub(r'<[^>]+>', '', link_title).strip().lower()
                    score = 0
                    if lt == term_lower:
                        score = 100
                    elif term_lower in lt:
                        score = 50 + len(term_lower) / max(len(lt), 1)
                    elif any(w in lt for w in term_lower.split() if len(w) > 2):
                        score = 25 + sum(len(w) for w in term_lower.split() if w in lt) / max(len(lt), 1)
                    if artist and artist.lower() in lt:
                        score += 20
                    if score > best_score:
                        best_score = score
                        best_link = link
            except Exception:
                continue

        if not best_link or best_score < 30:
            return None

        # Visit the lyrics page
        page = HTTP_SESSION.get(best_link, timeout=_LRCLIB_TIMEOUT, headers=_SCRAPER_HEADERS)
        if page.status_code != 200:
            return None

        text = page.text
        lyrics = ''

        # Method 1: transliteration (pre element)
        m = re.search(
            r'<pre[^>]*class="[^"]*bl-lyrics-col__body--pre[^"]*"[^>]*data-bl-copy="ro"[^>]*>(.*?)</pre>',
            text, re.DOTALL
        )
        if m:
            lyrics = m.group(1)

        # Method 2: Bengali lyrics div
        if not lyrics:
            m = re.search(
                r'<div[^>]*data-bl-copy="bn"[^>]*>(.*?)</div>\s*</div>\s*</section>',
                text, re.DOTALL
            )
            if m:
                lyrics = m.group(1)

        if not lyrics:
            return None

        lyrics = re.sub(r'<br\s*/?>', '\n', lyrics)
        lyrics = re.sub(r'<[^>]+>', '', lyrics)
        lyrics = html.unescape(lyrics).strip()
        lyrics = re.sub(r'\n{3,}', '\n\n', lyrics)
        lines = [l for l in lyrics.split('\n') if len(l.strip()) < 200]
        lyrics = '\n'.join(lines).strip()

        return lyrics if lyrics and len(lyrics) > 50 else None
    except Exception:
        return None


def _try_single_pair(title, artist, include_lrclib, deadline, original_basename=''):
    """Try all sources for a single (title, artist) pair. Returns lyrics or None."""
    sources = []
    if include_lrclib:
        sources.append(('lrclib', lambda: _search_lrclib(title, artist)))
    sources.append(('genius', lambda: _scrape_genius(title, artist)))
    sources.append(('ovh', lambda: _scrape_lyrics_ovh(title, artist)))
    if any(ord(c) > 127 for c in (title + artist)):
        sources.append(('letras', lambda: _scrape_letras(title, artist)))
        sources.append(('bangla', lambda: _scrape_bangla_lyrics(title, artist, original_basename)))

    with ThreadPoolExecutor(max_workers=min(len(sources), 4)) as pool:
        fut_map = {pool.submit(fn): name for name, fn in sources}
        remaining = max(0.5, deadline - time.monotonic())
        try:
            for fut in as_completed(fut_map, timeout=remaining):
                try:
                    res = fut.result(timeout=3)
                    if res:
                        for f in fut_map: f.cancel()
                        return res
                except Exception:
                    continue
        except FuturesTimeout:
            pass
    return None


def _try_all_sources(
    cleaned_title, cleaned_artist, original_title, original_artist, basename,
    include_lrclib=True
):
    """Try lyrics sources for best title/artist variants, return first result."""
    if not cleaned_title and not original_title:
        return None

    deadline = time.monotonic() + _TOTAL_TIMEOUT

    # Priority 1: cleaned title + cleaned artist (best match)
    if cleaned_title:
        result = _try_single_pair(cleaned_title, cleaned_artist or '', include_lrclib, deadline, basename)
        if result: return result
        if time.monotonic() > deadline: return None

    # Priority 2: original title (if different)
    if original_title and original_title != cleaned_title:
        result = _try_single_pair(original_title, original_artist or '', include_lrclib, deadline, basename)
        if result: return result
        if time.monotonic() > deadline: return None

    # Priority 3: cleaned title without artist
    if cleaned_title and cleaned_artist:
        result = _try_single_pair(cleaned_title, '', include_lrclib, deadline, basename)
        if result: return result
        if time.monotonic() > deadline: return None

    return None


def fetch_lyrics_from_lrclib(basename, title_hint='', artist_hint='', audio_path=''):
    """Public API. Tries all sources in parallel and returns first result.

    Total timeout per file: ~15 seconds. Returns plain text lyrics or None.
    """
    global _lrclib_failures, _lrclib_disabled, _lrclib_disabled_at

    with _lrclib_lock:
        if LRCLIB_SKIP:
            return None
        if _lrclib_disabled and time.time() - _lrclib_disabled_at > _lrclib_cooldown:
            _lrclib_disabled = False
            _lrclib_failures = 0
            logger.info("LRCLIB circuit breaker reset after cooldown")

    # Check in-memory cache
    with _cache_lock:
        if basename in _lyrics_cache:
            entry = _lyrics_cache[basename]
            if time.time() - entry['time'] < _CACHE_TTL:
                return entry['lyrics']

    # Gather metadata
    lrc_title = title_hint
    lrc_artist = artist_hint

    try:
        import mutagen
        af = mutagen.File(audio_path, easy=True)
        if af:
            m_title = str(af.get('title', [''])[0])
            m_artist = str(af.get('artist', [''])[0])
            if m_title and len(m_title) > 3:
                lrc_title = lrc_title or m_title
            if m_artist:
                lrc_artist = lrc_artist or m_artist
    except Exception:
        pass

    if not lrc_artist or not lrc_title or len(lrc_title) < 4:
        f_artist, f_title = _extract_artist_title_from_filename(basename)
        lrc_artist = lrc_artist or f_artist or ''
        if len(f_title) > len(lrc_title):
            lrc_title = f_title
    if not lrc_title:
        lrc_title = basename.replace('_', ' ').replace('-', ' ').strip()

    cleaned_title = _clean_title(lrc_title)
    cleaned_artist = _clean_artist(lrc_artist) if lrc_artist else ''

    # Determine if LRCLIB should be tried
    with _lrclib_lock:
        include_lrclib = not _lrclib_disabled

    # Try all sources in parallel
    lrc_text = _try_all_sources(
        cleaned_title, cleaned_artist, lrc_title, lrc_artist, basename,
        include_lrclib=include_lrclib
    )

    # Cache the result (even None to avoid repeated failed lookups)
    with _cache_lock:
        _lyrics_cache[basename] = {'time': time.time(), 'lyrics': lrc_text}

    # Update circuit breaker based on LRCLIB result
    if lrc_text:
        with _lrclib_lock:
            _lrclib_failures = 0
        logger.info(f"Found lyrics for: {cleaned_title or basename}")
    else:
        with _lrclib_lock:
            _lrclib_failures += 1
            if _lrclib_failures >= _lrclib_max_failures:
                _lrclib_disabled = True
                _lrclib_disabled_at = time.time()
                logger.warning("LRCLIB circuit breaker opened (too many failures)")

    return lrc_text
