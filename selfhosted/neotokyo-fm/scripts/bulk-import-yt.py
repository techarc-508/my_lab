#!/usr/bin/env python3
"""Bulk import YouTube URLs into NeoTokyo FM."""

import json, re, sys, time, uuid, urllib.request, urllib.parse

API = sys.argv[1] if len(sys.argv) > 1 else 'http://192.168.0.104'
ADMIN_USER = sys.argv[2] if len(sys.argv) > 2 else 'admin'
ADMIN_PASS = sys.argv[3] if len(sys.argv) > 3 else input('Admin password: ')

URLS_RAW = """
https://youtu.be/LN7Ywck3OXY?si=PlpmbSyt8goERijH
https://youtu.be/pHu4PLhuKgQ?si=z92ob-G7RHgBJ5Ei
https://youtu.be/QYO6AlxiRE4?si=eL_OCYx9jHFkUdT_
https://youtu.be/TyMUY2CDrjc?si=igLxIo2xe8SiFtRr
https://youtu.be/IZF-rOe9u-g?si=FxvWQylNLwo78L5y
https://youtu.be/vr8RaNuWjWc?si=yxKDmNxdF3_d8Q1E
https://youtu.be/c_wLdXvtEZI?si=Fs_6WTy5fpSHH_4j
https://youtu.be/6w67NOaRe-w?si=ViZ1e7Zt-8jyK0SG
https://youtu.be/RLzC55ai0eo?si=eBZN1ZeN9y_tyme9
https://youtu.be/cbr2i96Q4ak?si=SsSsY7jp6fdebEip
https://youtu.be/MJyKN-8UncM?si=IJ-eyeeg63TCH6Vp
https://youtu.be/cU3IO6Am65o?si=lFnj09nHXTcI8IfM
https://youtu.be/zFdi834FiZ4?si=xXpS8j0zoZv3GNMt
https://youtu.be/hJBHSmyqv0Y?si=BOyRlIw4nbhdrMpP
https://youtu.be/hoNb6HuNmU0?si=BEzJ3jxFO6jywzCm
https://youtu.be/gkCKTuR-ECI?si=creSIZ_6b6IWuy7D
https://youtu.be/aNToVeBBKn4?si=aERBoCdsI8evoTb6
https://youtu.be/CcCkXKbBkzY?si=M6PLRl1Ieyn331vW
https://youtu.be/hlRTxA10eRA?si=uC-NUZRi0JfthjZB
https://youtu.be/k7fPoKUXaWM?si=4_ue9xWeN1Tr970R
https://youtu.be/gzmXpwF_MK4?si=mojLPBPwDIpBQFpu
https://youtu.be/EpEraRui1pc?si=PXK4VPuCVPIsUZZC
https://youtu.be/kPtn26x8TZM?si=zTyoJXZFjN_2pFpk
https://youtu.be/JwsJqZzWXwA?si=gIEIKFClKcBS4s4X
https://youtu.be/byitAI7kkOM?si=7aAKJCv37kteXhDn
https://youtu.be/jx0qbW_YTCs?si=y6eYjJlqW7LnOBAd
https://youtu.be/Gtxkc-c9D8Y?si=Hjf8UmAg_Od3VGB-
https://youtu.be/Owv1GBWXkwY?si=7MttNtTxWThYBet5
https://youtu.be/zQl7zYkEP6M?si=XACuvq1T-6txdmgb
https://youtu.be/3nA1hmKCRpE?si=6rDVc3nV7g1l064C
https://youtu.be/E4ZJxhyAaH8?si=BR3DPNuwmK0c7b7I
https://youtu.be/Iqu_W5W4YO4?si=xzYt5dRMvwukTUER
https://youtu.be/SS3lIQdKP-A?si=MnRhEfn7OCqQuQm-
https://youtu.be/2CeoFnb16l4?si=CjqeqEIGUpBqOT3V
https://youtu.be/q0loWjfX0d8?si=A2drmLDE1G2dOiBB
https://youtu.be/q0loWjfX0d8?si=2vcPjklcV7b3G8As
https://youtu.be/7jhSVtC6Axs?si=4zOsDJm49nKteF7t
https://youtu.be/2uUmHTgT65I?si=66KA763-8Ti-mJrr
https://youtu.be/J2Bh68GTUOU?si=LZfMqTSZPxUiR5D5
https://youtu.be/WGXmDsOwW4k?si=Ryprh1SpjQI_8ja-
https://youtu.be/gavPKwaMFyc?si=DtLOSReG1jv1kK2d
https://youtu.be/yYzhGGOd25o?si=G9ovrmgk5coVKj91
https://youtu.be/GUBa1wRxQko?si=FtyQqpD7b4cTYYI8
https://youtu.be/xM_GfQvb36U?si=mm-TLIP85zy8KjAE
https://youtu.be/xM_GfQvb36U?si=61xl3LFwuH6yF2jF
https://youtu.be/LEYXdZ_rVbo?si=DokAsU6EeCX5bqbm
https://youtu.be/w3MMMgxjLFk?si=uKbLWmKTq5smWAL2
https://youtu.be/3PqxT1VqyNc?si=GFIRz2KcMo1sm-je
https://youtu.be/YAQdrO3FCww?si=h0CTCLBqyL3zVAEO
https://youtu.be/kCQ6zaHDXj4?si=UIL-qU1Fnk_Ci_eR
https://youtu.be/0AqZzax9_Og?si=LuHft-UUrd9DHR9W
https://youtu.be/vtN5JrIe5YQ?si=mERF6olHd36Xsswd
https://youtu.be/YB0Mq0WDNzE?si=dJ2uMJ_vP4ra3wSl
https://youtu.be/TWcSSDtSz0o?si=zCr19q67e9GrFb7j
https://youtu.be/sm2hNJ9c8M8?si=zjlcu1mlpoq_jvTl
https://youtu.be/yoTFYixtr7Q?si=EgyrcBRpHW0FvejP
https://youtu.be/TQR70KKYMmQ?si=6Y_C1Qt5QqfxmMry
https://youtu.be/vxVsDSB5UWw?si=5tZITSaxX14BtNGf
https://youtu.be/fyno2GRGgVg?si=oQvN1jfVm_AXzjvM
https://youtu.be/zWEOx7TSM6I?si=e_tAgBD5_WquqBFN
https://youtu.be/b42_llWyz10?si=0cVJiEGDv3vJxBGl
https://youtu.be/AYcxiROIktI?si=7nnmSDz5xcCmzear
https://youtu.be/MVpAAJzPEds?si=3jBZ6az8W7UCVnTM
https://youtu.be/nJZcbidTutE?si=Ycuw_4UBUPOF0dfC
https://youtu.be/ln8KreDppvI?si=TprjSyQIeK9wUxGK
https://youtu.be/LN07AbMX_HU?si=FupCu6xRXsmDb6tj
https://youtu.be/V8zXLMIjlcw?si=-5sgHiq8HMct8AL6
https://youtu.be/x_elT6zkqN0?si=g4NrifAJAdb2EJWd
https://youtu.be/pHu4PLhuKgQ?si=JgUfEGoTEc5Ku2Yx
https://youtu.be/KI9fXv2qQ40?si=m2SSSdkhKrMULoFs
https://youtu.be/yHJf8MSPHk0?si=FvQh24_ohrjhHaF_
https://youtu.be/2ltGXfmI6mk?si=LRoF-WZtYRgemVe8
https://youtu.be/UlacMvx_VYk?si=mKk-K2xdb_HdM7EI
https://youtu.be/DLN4yfKYTqE?si=pMFuAH1_NddZphQf
https://youtu.be/cRhuUGx8iTk?si=KhvfoQkhCFTico5W
https://youtu.be/_D-BjGZDa48?si=yebBl0a8G0nYiNSo
https://youtu.be/WkkLuQQ_IgY?si=jxjQWE9blwcTTcmo
https://youtu.be/IU2ttJ73h2Y?si=oXcXiQH4aZ2p7PCV
https://youtu.be/zNUs54J3mKo?si=rCmrwS3U9b_cUwRd
https://youtu.be/rD_UrVm8RJQ?si=bD8IdTQJoyZSLPpn
https://youtu.be/BYYBXNaTnWM?si=4Y2B1JKO9Y1YwETt
https://youtu.be/BYYBXNaTnWM?si=mtHhGceHeBR4w34V
https://youtu.be/35dAyCSVdyo?si=nu9V_N90pddgR-aQ
https://youtu.be/TuUVVKVdZm4?si=z_pueNsjSdAjpwCE
https://youtu.be/yIyVhIspa2I?si=838759xXN8JKxgRk
https://youtu.be/1aQTCPxZre8?si=IWXGQLa3ilVfRojy
https://youtu.be/jtP1JKdgEik?si=QnsI-HYVkGOcMY2r
https://youtu.be/jtP1JKdgEik?si=xcKMH_TQRqeh87BN
https://youtu.be/afCJj1Y8bg0?si=IQM6LTPLuV8DSMHu
https://youtu.be/afCJj1Y8bg0?si=f8hXhx4KsaNFFFJF
https://youtu.be/YAlMJvvlOig?si=6QFUQDuhCCj9kEiq
https://youtu.be/5oa_yRBI02c?si=WYnjY2d2J9Ocdr0P
https://youtu.be/L91CdKfRun0?si=TF8TL2zEZ79ZmcKo
https://youtu.be/xxhThAj7aSA?si=Y9mGXZlwV8_S65rm
https://youtu.be/NGBX9Ox0fCs?si=gn-W8MYY2L9Yhjkb
https://youtu.be/GkiYHbjiy5A?si=7NsosD3ijEWd3icI
https://youtu.be/Dv72uNkrOVM?si=AtMLE3OwnH7UkoPY
https://youtu.be/3JnXgAtt34M?si=_K5dzr2cmNAbKpWF
https://youtu.be/yBahBBAHs04?si=JHmhgvrqi8LLp1wn
https://youtu.be/YAQdrO3FCww?si=2hDmGKCojeVOydsY
https://youtu.be/qE3DfF66DNA?si=3KnCmpTXChTzPMsz
https://youtu.be/9_BUZaTcozs?si=nog-Ebqv0WCeOWdI
https://youtu.be/n-bsPnT5ZpQ?si=_XDV6ybmFtelUuxQ
https://youtu.be/RRfHzBdcGGc?si=XhMi7MAVUsDCVGHO
https://youtu.be/JFcgOboQZ08?si=8Y2rM5sYMdV4D7qS
https://youtu.be/II2EO3Nw4m0?si=GnJceMbcXWI-4hZO
https://youtu.be/ruEQPQX90fI?si=cAHl0uJc42Ug-S4e
https://youtu.be/zC3UbTf4qrM?si=s1EPgRT-ZtHN76YB
https://youtu.be/95I5VaR7GeU?si=aiZgnwOnKEHNKvEl
https://youtu.be/sK7riqg2mr4?si=mNCL2OXV-3JjywLG
https://youtu.be/Zheks4f_afI?si=7DLACx0KO9kxzclu
""".strip().split('\n')

# Extract video IDs, deduplicate
def extract_id(url):
    m = re.search(r'youtu\.be/([A-Za-z0-9_-]{11})', url)
    if m: return m.group(1)
    m = re.search(r'v=([A-Za-z0-9_-]{11})', url)
    if m: return m.group(1)
    return None

seen = set()
unique = []
for url in URLS_RAW:
    url = url.strip()
    if not url: continue
    vid = extract_id(url)
    if vid and vid not in seen:
        seen.add(vid)
        unique.append(f'https://www.youtube.com/watch?v={vid}')

print(f'{len(URLS_RAW)} raw URLs → {len(unique)} unique videos')

# Login
data = json.dumps({'username': ADMIN_USER, 'password': ADMIN_PASS}).encode()
req = urllib.request.Request(f'{API}/api/csrf-token')
with urllib.request.urlopen(req) as resp:
    csrf = json.loads(resp.read())['csrf_token']

req = urllib.request.Request(f'{API}/api/login', data=data, method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('X-CSRF-Token', csrf)
# Need cookie jar for session
import http.cookiejar
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# CSRF with cookies
req = urllib.request.Request(f'{API}/api/csrf-token')
with opener.open(req) as resp:
    csrf = json.loads(resp.read())['csrf_token']

data = json.dumps({'username': ADMIN_USER, 'password': ADMIN_PASS}).encode()
req = urllib.request.Request(f'{API}/api/login', data=data, method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('X-CSRF-Token', csrf)
with opener.open(req) as resp:
    login_data = json.loads(resp.read())
    token = login_data['token']
    print(f'Logged in as {login_data["username"]} ({login_data["role"]})')

# Submit downloads in batches of 10
BATCH = 10
for i in range(0, len(unique), BATCH):
    batch = unique[i:i+BATCH]
    files = [{'url': u} for u in batch]
    payload = json.dumps({'files': files, 'duplicates': 'skip', 'format': 'mp3_192'}).encode()
    req = urllib.request.Request(f'{API}/api/downloads', data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('X-CSRF-Token', csrf)
    with opener.open(req) as resp:
        result = json.loads(resp.read())
        count = result.get('count', 0)
        queued = sum(1 for d in result.get('downloads', []) if d.get('status') not in ('failed',))
        failed = sum(1 for d in result.get('downloads', []) if d.get('status') == 'failed')
        print(f'Batch {i//BATCH+1}: submitted {count} → queued={queued} failed={failed}')
        if failed:
            for d in result.get('downloads', []):
                if d.get('status') == 'failed':
                    print(f'  FAILED: {d.get("url","?")} — {d.get("error","?")}')

    time.sleep(1)

print(f'\nDone! {len(unique)} downloads submitted. Monitor at {API}/admin/downloads')
