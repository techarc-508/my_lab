"""Generate PWA PNG icons matching favicon.svg style.
Run from repo root: python3 scripts/generate-icons.py
"""
import os
PUBLIC = os.path.join(os.path.dirname(__file__), '..', 'client', 'public')
from PIL import Image, ImageDraw
import math

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    s = size  # shorthand

    # rounded rect helper
    def rr(draw, xy, r, fill=None, outline=None, width=1):
        x1,y1,x2,y2 = xy
        draw.pieslice([x1, y1, x1+r*2, y1+r*2], 180, 270, fill=fill, outline=outline, width=width)
        draw.pieslice([x2-r*2, y1, x2, y1+r*2], 270, 360, fill=fill, outline=outline, width=width)
        draw.pieslice([x1, y2-r*2, x1+r*2, y2], 90, 180, fill=fill, outline=outline, width=width)
        draw.pieslice([x2-r*2, y2-r*2, x2, y2], 0, 90, fill=fill, outline=outline, width=width)
        draw.rectangle([x1+r, y1, x2-r, y2], fill=fill, outline=outline, width=width)
        draw.rectangle([x1, y1+r, x2, y2-r], fill=fill, outline=outline, width=width)

    bg_r = int(s * 0.18)
    rr(d, [0,0,s,s], bg_r, fill=(27,26,48,255))

    # outer neon border
    rr(d, [int(s*0.05),int(s*0.05),int(s*0.95),int(s*0.95)], int(s*0.14), outline=(255,0,110,255), width=max(2, s//40))

    # cassette body
    pad = int(s * 0.12)
    cas_r = int(s * 0.05)
    rr(d, [pad, int(s*0.22), s-pad, int(s*0.78)], cas_r, fill=(37,36,69,255), outline=(58,134,255,255), width=max(2, s//32))

    # cassette label
    lab_pad = int(s * 0.06)
    lab_r = int(s * 0.03)
    rr(d, [pad+lab_pad, int(s*0.28), s-pad-lab_pad, int(s*0.55)], lab_r, fill=(27,26,48,255), outline=(255,0,110,255), width=max(2, s//48))

    # tape lines
    ly = int(s * 0.34)
    d.line([int(s*0.23), ly, int(s*0.77), ly], fill=(58,134,255,255), width=max(2, s//64))
    ly2 = int(s * 0.39)
    d.line([int(s*0.23), ly2, int(s*0.62), ly2], fill=(255,0,110,255), width=max(2, s//80))

    # center wheel area
    wh_r = int(s * 0.06)
    wh_y = int(s * 0.44)
    wh_h = int(s * 0.12)
    rr(d, [int(s*0.28), wh_y, int(s*0.72), wh_y+wh_h], wh_r, fill=(13,12,29,255), outline=(58,134,255,255), width=max(1, s//85))

    # left wheel
    cx1, cy = int(s*0.375), int(s*0.50)
    wr = max(3, s//26)
    d.ellipse([cx1-wr, cy-wr, cx1+wr, cy+wr], outline=(255,255,255,255), width=max(1, s//85), fill=None)
    # dash on wheel
    for a in range(0, 360, 60):
        rad = math.radians(a)
        x1 = cx1 + int(wr*0.7*math.cos(rad))
        y1 = cy + int(wr*0.7*math.sin(rad))
        x2 = cx1 + int(wr*math.cos(rad))
        y2 = cy + int(wr*math.sin(rad))
        d.line([x1,y1,x2,y2], fill=(255,255,255,255), width=max(1, s//85))
    d.ellipse([cx1-wr//3, cy-wr//3, cx1+wr//3, cy+wr//3], fill=(255,0,110,255))

    # right wheel
    cx2 = int(s*0.625)
    d.ellipse([cx2-wr, cy-wr, cx2+wr, cy+wr], outline=(255,255,255,255), width=max(1, s//85), fill=None)
    for a in range(0, 360, 60):
        rad = math.radians(a)
        x1 = cx2 + int(wr*0.7*math.cos(rad))
        y1 = cy + int(wr*0.7*math.sin(rad))
        x2 = cx2 + int(wr*math.cos(rad))
        y2 = cy + int(wr*math.sin(rad))
        d.line([x1,y1,x2,y2], fill=(255,255,255,255), width=max(1, s//85))
    d.ellipse([cx2-wr//3, cy-wr//3, cx2+wr//3, cy+wr//3], fill=(255,0,110,255))

    # bottom trapezoid area
    trap_y = int(s*0.72)
    d.polygon([
        (int(s*0.25), int(s*0.78)),
        (int(s*0.28), int(s*0.63)),
        (int(s*0.72), int(s*0.63)),
        (int(s*0.75), int(s*0.78)),
    ], fill=(27,26,48,255), outline=(58,134,255,255), width=max(1, s//64))

    # corner screws
    scr_r = max(2, s//64)
    for xy in [(int(s*0.17), int(s*0.27)), (int(s*0.83), int(s*0.27)),
               (int(s*0.17), int(s*0.73)), (int(s*0.83), int(s*0.73))]:
        d.ellipse([xy[0]-scr_r, xy[1]-scr_r, xy[0]+scr_r, xy[1]+scr_r], fill=(58,134,255,255))

    return img

if __name__ == '__main__':
    for s in [192, 512]:
        img = make_icon(s)
        path = os.path.join(PUBLIC, f'icon-{s}.png')
        img.save(path, 'PNG')
        print(f'icon-{s}.png ({s}x{s})')
