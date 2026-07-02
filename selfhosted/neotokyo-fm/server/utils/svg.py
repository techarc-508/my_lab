import html

def generate_fallback_svg(genre: str, title: str = "", artist: str = "") -> str:
    genre = (genre or "").lower()
    title = title or "NeoTokyo Track"
    artist = artist or "Retro Artist"

    title_esc = html.escape(title)
    artist_esc = html.escape(artist)

    if any(g in genre for g in ["city pop", "citypop", "sunset", "pop", "mari", "tatsuro", "anri", "plastic love", "80s", "disco", "future funk", "funk"]):
        theme_name = "CITY POP"
        accent_color = "#ff7e5f"
        bg_gradient = """
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f051d"/>
            <stop offset="40%" stop-color="#2d0b54"/>
            <stop offset="75%" stop-color="#7a1b5c"/>
            <stop offset="100%" stop-color="#ff7e5f"/>
        </linearGradient>
        """
        graphic = """
        <circle cx="100" cy="100" r="45" fill="url(#sun-grad)"/>
        <g stroke="#0f051d" stroke-width="2">
            <line x1="50" y1="105" x2="150" y2="105"/>
            <line x1="52" y1="112" x2="148" y2="112"/>
            <line x1="55" y1="120" x2="145" y2="120"/>
            <line x1="60" y1="128" x2="140" y2="128"/>
            <line x1="70" y1="136" x2="130" y2="136"/>
        </g>
        <path d="M40,150 Q45,110 35,90 Q40,92 45,95 Q42,88 38,82 Q45,84 50,88 Q44,78 38,72 Q46,76 52,82 Q42,66 35,60 Q43,68 47,75 Q48,65 48,55 Q51,65 50,75 Q55,68 62,62 Q56,71 52,78 Q60,76 68,76 Q58,82 52,84 Q62,90 68,98 Q56,92 49,88 Q50,110 42,150 Z" fill="#0f051d"/>
        <path d="M160,150 Q155,115 162,95 Q158,97 153,99 Q155,91 159,85 Q152,87 148,91 Q153,81 159,75 Q152,79 146,85 Q155,69 162,63 Q154,71 150,78 Q149,68 149,58 Q146,68 147,78 Q142,71 135,65 Q141,74 145,81 Q137,79 129,79 Q139,85 145,87 Q135,93 129,101 Q141,95 148,91 Q147,113 158,150 Z" fill="#0f051d"/>
        """
    elif any(g in genre for g in ["synthwave", "retrowave", "outrun", "cyber", "cyberpunk", "grid"]):
        theme_name = "SYNTHWAVE"
        accent_color = "#00f0ff"
        bg_gradient = """
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#050515"/>
            <stop offset="50%" stop-color="#150a30"/>
            <stop offset="100%" stop-color="#300528"/>
        </linearGradient>
        """
        graphic = """
        <g stroke="#ff007f" stroke-width="0.7" opacity="0.6">
            <line x1="100" y1="100" x2="0" y2="160"/>
            <line x1="100" y1="100" x2="25" y2="160"/>
            <line x1="100" y1="100" x2="50" y2="160"/>
            <line x1="100" y1="100" x2="75" y2="160"/>
            <line x1="100" y1="100" x2="100" y2="160"/>
            <line x1="100" y1="100" x2="125" y2="160"/>
            <line x1="100" y1="100" x2="150" y2="160"/>
            <line x1="100" y1="100" x2="175" y2="160"/>
            <line x1="100" y1="100" x2="200" y2="160"/>
            <line x1="0" y1="105" x2="200" y2="105"/>
            <line x1="0" y1="112" x2="200" y2="112"/>
            <line x1="0" y1="121" x2="200" y2="121"/>
            <line x1="0" y1="132" x2="200" y2="132"/>
            <line x1="0" y1="145" x2="200" y2="145"/>
        </g>
        <polygon points="10,100 50,60 90,100" fill="#0c0721" stroke="#00f0ff" stroke-width="1.5"/>
        <polygon points="75,100 120,50 165,100" fill="#0d051f" stroke="#ff007f" stroke-width="1.5"/>
        <polygon points="130,100 165,70 200,100" fill="#0c0721" stroke="#00f0ff" stroke-width="1"/>
        <circle cx="100" cy="55" r="20" fill="#fefe33" opacity="0.85"/>
        """
    elif any(g in genre for g in ["lofi", "lo-fi", "chill", "relax", "study", "sleep"]):
        theme_name = "LO-FI CHILL"
        accent_color = "#ffb07c"
        bg_gradient = """
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1c1124"/>
            <stop offset="50%" stop-color="#2c1a30"/>
            <stop offset="100%" stop-color="#140d1a"/>
        </linearGradient>
        """
        graphic = """
        <rect x="50" y="40" width="100" height="80" rx="6" fill="#140c1a" stroke="#4c3156" stroke-width="2"/>
        <line x1="100" y1="40" x2="100" y2="120" stroke="#4c3156" stroke-width="1.5"/>
        <line x1="50" y1="80" x2="150" y2="80" stroke="#4c3156" stroke-width="1.5"/>
        <circle cx="75" cy="60" r="8" fill="#ffdf7a"/>
        <circle cx="78" cy="60" r="8" fill="#140c1a"/>
        <circle cx="125" cy="55" r="1" fill="#fff" opacity="0.8"/>
        <circle cx="135" cy="70" r="1" fill="#fff" opacity="0.5"/>
        <path d="M92,118 L108,118 L106,108 L94,108 Z" fill="#ffb07c"/>
        <path d="M106,110 C109,110 109,114 106,114" fill="none" stroke="#ffb07c" stroke-width="1.5"/>
        <path d="M96,104 Q98,100 96,96" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
        <path d="M100,105 Q102,101 100,97" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
        <path d="M104,104 Q106,100 104,96" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
        """
    elif any(g in genre for g in ["anime", "jpop", "j-pop", "vocaloid", "miku", "kawaii"]):
        theme_name = "KAWAII J-POP"
        accent_color = "#ff8fa3"
        bg_gradient = """
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b1c32"/>
            <stop offset="50%" stop-color="#5c2e4b"/>
            <stop offset="100%" stop-color="#231221"/>
        </linearGradient>
        """
        graphic = """
        <g transform="translate(100,80) scale(1.3)" fill="#ffb3c1">
            <path d="M0,0 C-15,-25 15,-25 0,0" />
            <path d="M0,0 C25,-15 25,15 0,0" transform="rotate(72)" />
            <path d="M0,0 C15,25 -15,25 0,0" transform="rotate(144)" />
            <path d="M0,0 C-25,15 -25,-15 0,0" transform="rotate(216)" />
            <path d="M0,0 C-25,-15 25,-15 0,0" transform="rotate(288)" />
            <circle cx="0" cy="0" r="5" fill="#ffe5ec"/>
        </g>
        <path d="M45,50 L48,55 L53,56 L48,57 L45,62 L42,57 L37,56 L42,55 Z" fill="#fff" opacity="0.8"/>
        <path d="M150,110 L152,113 L155,114 L152,115 L150,118 L148,115 L145,114 L148,113 Z" fill="#ffd6e0" opacity="0.9"/>
        <path d="M140,40 L141.5,43 L144.5,44 L141.5,45 L140,48 L138.5,45 L135.5,44 L138.5,43 Z" fill="#ffd6e0" opacity="0.7"/>
        """
    else:
        theme_name = "NEOTOKYO RADIO"
        accent_color = "#00e3fd"
        bg_gradient = """
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0a0a1a"/>
            <stop offset="50%" stop-color="#141938"/>
            <stop offset="100%" stop-color="#050510"/>
        </linearGradient>
        """
        graphic = """
        <circle cx="100" cy="80" r="42" fill="#121212" stroke="#222" stroke-width="3"/>
        <circle cx="100" cy="80" r="32" fill="none" stroke="#ff77a9" stroke-width="0.5" stroke-dasharray="10, 5"/>
        <circle cx="100" cy="80" r="24" fill="none" stroke="#00e3fd" stroke-width="0.5"/>
        <circle cx="100" cy="80" r="16" fill="url(#sun-grad)"/>
        <circle cx="100" cy="80" r="4" fill="#0a0a1a"/>
        <path d="M30,130 Q45,120 60,130 T90,130 T120,130 T150,130 T170,130" fill="none" stroke="#ff77a9" stroke-width="1" opacity="0.4"/>
        <path d="M30,135 Q45,125 60,135 T90,135 T120,135 T150,135 T170,135" fill="none" stroke="#00e3fd" stroke-width="1.5" opacity="0.6"/>
        """

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
    <defs>
        {bg_gradient}
        <linearGradient id="sun-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffe600"/>
            <stop offset="50%" stop-color="#ff007f"/>
            <stop offset="100%" stop-color="#760089"/>
        </linearGradient>
        <linearGradient id="text-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fff"/>
            <stop offset="100%" stop-color="{accent_color}"/>
        </linearGradient>
        <style>
            .title {{
                font-family: 'Anybody', 'Helvetica Neue', sans-serif;
                font-weight: 800;
                font-size: 11px;
                fill: url(#text-grad);
                text-anchor: middle;
            }}
            .artist {{
                font-family: 'Space Mono', 'Courier New', monospace;
                font-weight: 400;
                font-size: 7.5px;
                fill: #a5a5c5;
                text-anchor: middle;
            }}
            .theme-tag {{
                font-family: 'Space Mono', 'Courier New', monospace;
                font-weight: 700;
                font-size: 6px;
                fill: {accent_color};
                letter-spacing: 2.5px;
                text-anchor: middle;
                opacity: 0.85;
            }}
        </style>
    </defs>

    <rect width="200" height="200" fill="url(#bg)" />
    <rect width="190" height="190" x="5" y="5" rx="4" fill="none" stroke="{accent_color}" stroke-width="0.5" opacity="0.25" />

    {graphic}

    <text x="100" y="153" class="theme-tag">{theme_name}</text>
    <text x="100" y="169" class="title">{title_esc}</text>
    <text x="100" y="181" class="artist">{artist_esc}</text>
</svg>'''
    return svg
