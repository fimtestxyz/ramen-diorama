#!/usr/bin/env python3
"""Figures + remaining numbers for the seam report (matcha).

1. px=0.02 row (cut off in the earlier run).
2. y-extent of each band at px=+0.16 (which rows the band spans).
3. Annotated crops: shipped composite vs ideal composite around the
   two main bands + left-edge band.
4. Brightening check: luminance step across the matcha strip in the OLD
   source art (assets/scenes/_raw/old-kyoto-matcha-source-art-v2.png)
   vs the CURRENT source art.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, "/tmp/seamtest")
import repro2

FIG = os.path.expanduser(
    "~/workspace/ramen-diorama/analysis/seam-diagnosis/figures")
os.makedirs(FIG, exist_ok=True)

src, layers = repro2.load_scene("kyoto-matcha")
ideal, _ = repro2.ideal_plates(src, layers)


def bands_at(px, py=0.0):
    actual = repro2.composite_from_plates(layers, px, py)
    ref = repro2.composite_from_plates(ideal, px, py)
    err = np.abs(actual - ref).mean(axis=2)
    bad = (err > 15)
    frac = bad.mean(axis=0)
    bands = repro2.bands_from_frac(frac)
    out = []
    for (x0, x1) in bands:
        col_bad = bad[:, x0:x1].mean(axis=1)
        rows = np.where(col_bad > 0.5)[0]
        y0, y1 = (int(rows.min()), int(rows.max())) if len(rows) else (-1, -1)
        out.append((x0, x1, y0, y1, float(err[:, x0:x1].mean())))
    return actual, ref, err, out


# 1. px = 0.02
_, _, _, b = bands_at(0.02)
print("px=+0.02 bands:", b)

# 2. y-extents at px=+0.16
actual, ref, err, b16 = bands_at(0.16)
print("px=+0.16 bands (x0,x1,y0,y1,mean-err):")
for row in b16:
    print("   ", row)

# 3. annotated crops: full-height strips around the bands
comp_u8 = np.clip(actual, 0, 255).astype(np.uint8)
ref_u8 = np.clip(ref, 0, 255).astype(np.uint8)


def side_by_side(x0, x1, name, pad=60):
    a = comp_u8[:, max(0, x0 - pad):x1 + pad]
    r = ref_u8[:, max(0, x0 - pad):x1 + pad]
    combo = np.concatenate([a, r], axis=1)
    img = Image.fromarray(combo)
    d = ImageDraw.Draw(img)
    bx0 = x0 - max(0, x0 - pad)
    bx1 = bx0 + (x1 - x0)
    d.rectangle([bx0, 0, bx1, 1079], outline=(255, 0, 0), width=4)
    d.rectangle([bx0 + a.shape[1], 0, bx1 + a.shape[1], 1079],
                outline=(0, 255, 0), width=4)
    img.save(os.path.join(FIG, name))
    print("saved", name, img.size)


side_by_side(1191, 1225, "matcha-px016-band-1191-1225-vs-ideal.png")
side_by_side(40, 75, "matcha-px016-band-40-75-vs-ideal.png")
# full frame with band boxes (downscaled for the report)
small = cv2.resize(comp_u8, (960, 540))
img = Image.fromarray(small)
d = ImageDraw.Draw(img)
for (x0, x1, y0, y1, _) in b16:
    d.rectangle([x0 / 2, y0 / 2, x1 / 2, y1 / 2], outline=(255, 0, 0),
                width=3)
img.save(os.path.join(FIG, "matcha-px016-fullframe-bands.png"))
print("saved matcha-px016-fullframe-bands.png")

# 4. brightening check: horizontal luminance profile across the matcha
# shoji post (x ~1100-1200), averaged over y=100..700, old vs new art.
old_path = os.path.expanduser(
    "~/workspace/ramen-diorama/assets/scenes/_raw/"
    "old-kyoto-matcha-source-art-v2.png")
if os.path.exists(old_path):
    old = np.asarray(Image.open(old_path).convert("RGB")).astype(np.float32)
    new = src
    for tag, art in (("OLD", old), ("NEW", new)):
        g = art[100:700, :, :].mean(axis=2).mean(axis=0)  # luminance vs x
        # step: mean of x1120-1150 minus mean of x1180-1210 (post vs garden)
        post = g[1120:1150].mean()
        garden = g[1180:1210].mean()
        print(f"matcha shoji edge {tag}: post-side {post:.1f} garden-side "
              f"{garden:.1f} step {garden - post:+.1f}")
else:
    print("old art backup not found:", old_path)
