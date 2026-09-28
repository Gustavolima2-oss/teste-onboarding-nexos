#!/usr/bin/env python3
"""Lado a lado: render × PNG do Figma, mesma escala (crop do node 439×245 em volta do centro do corpo).
Uso: compare-nexo.py <render.png> <cx> <cy> <figma-frame.png|-> <fcx> <fcy> <saida.png> [zoom]"""
import sys
from PIL import Image, ImageDraw

render, cx, cy, figma, fcx, fcy, out = sys.argv[1:8]
zoom = float(sys.argv[8]) if len(sys.argv) > 8 else 2
W, H, OX, OY = 385, 215, 195.3, 84.33  # node do Figma (fase 2) relativo ao centro do corpo

def crop(path, x, y):
    im = Image.open(path).convert('RGB')
    box = (round(x - OX), round(y - OY), round(x - OX) + W, round(y - OY) + H)
    c = Image.new('RGB', (W, H), (40, 40, 40))
    c.paste(im.crop(box), (0, 0))
    return c.resize((int(W * zoom), int(H * zoom)), Image.LANCZOS)

a = crop(render, float(cx), float(cy))
b = crop(figma, float(fcx), float(fcy)) if figma != '-' else None
tiles = [a] + ([b] if b else [])
o = Image.new('RGB', (sum(t.width for t in tiles) + 8 * (len(tiles) - 1), a.height + 22), (255, 255, 255))
d = ImageDraw.Draw(o)
x = 0
for t, label in zip(tiles, ['render 3D', 'PNG Figma']):
    o.paste(t, (x, 22)); d.text((x + 6, 5), label, fill=(0, 0, 0)); x += t.width + 8
o.save(out)
