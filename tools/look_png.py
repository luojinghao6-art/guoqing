# -*- coding: utf-8 -*-
"""look_png.py —— 把 PNG 降采样成字符画，便于在无图形环境下检查构图。
用法: python tools/look_png.py <png> [--w 110] [--h 40] [--mode max] [--box x0,y0,x1,y1]
"""
import sys, argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('png')
ap.add_argument('--w', type=int, default=110)
ap.add_argument('--h', type=int, default=40)
ap.add_argument('--mode', default='max')
ap.add_argument('--thr', type=float, default=0.0, help='only show cells whose max lum >= thr (0-1)')
ap.add_argument('--box', default='0,0,1,1')
a = ap.parse_args()

box = [float(v) for v in a.box.split(',')]
im = Image.open(a.png).convert('RGB')
W, H = im.size
px = im.load()
x0 = int(box[0]*W); y0 = int(box[1]*H); x1 = int(box[2]*W); y1 = int(box[3]*H)
if x1 <= x0: x1 = W
if y1 <= y0: y1 = H

RAMP = ' .:-=+*#%@'
lines = []
for gy in range(a.h):
    line = ''
    for gx in range(a.w):
        ax = x0 + int(gx / a.w * (x1 - x0)); bx = max(ax+1, x0 + int((gx+1) / a.w * (x1 - x0)))
        ay = y0 + int(gy / a.h * (y1 - y0)); by = max(ay+1, y0 + int((gy+1) / a.h * (y1 - y0)))
        r = g = b = 0; n = 0; br = bg = bb = 0; bl = -1
        for y in range(ay, min(by, H), max(1,(by-ay)//4 or 1)):
            for x in range(ax, min(bx, W), max(1,(bx-ax)//4 or 1)):
                p = px[x, y]; r += p[0]; g += p[1]; b += p[2]; n += 1
                l = p[0]*0.299 + p[1]*0.587 + p[2]*0.114
                if l > bl: bl = l; br, bg, bb = p
        if n == 0: continue
        r //= n; g //= n; b //= n
        if a.mode == 'max': r, g, b = br, bg, bb
        lum = (r*0.299 + g*0.587 + b*0.114) / 255.0
        mx = max(r, g, b); mn = min(r, g, b)
        sat = (mx - mn) / mx if mx > 0 else 0
        if a.thr > 0 and bl < a.thr:
            ch = ' '
        elif a.thr > 0:
            ch = RAMP[min(9, int(lum * 9.999))]
        elif lum < 0.05:
            ch = ' '
        elif sat > 0.30:
            if r >= g and r >= b:
                ch = 'R' if g < 0.55*r else 'Y'      # 红 / 橙黄
            elif g >= b:
                ch = 'G'
            else:
                ch = 'B'
        else:
            ch = RAMP[min(9, int(lum * 9.999))]
        line += ch
    lines.append(line)
print('图像 %dx%d  区域 x%d-%d y%d-%d  mode=%s' % (W, H, x0, x1, y0, y1, a.mode))
print('-' * a.w)
print('\n'.join(lines))
