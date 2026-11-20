#!/usr/bin/env python3
"""Reproduce the parallax seam offline, v2.

Reference is NOT the source art (parallax legitimately moves content)
but the IDEAL composite: source art split by the same hard masks,
shifted by the same per-layer amounts.  Error vs ideal isolates the
seam artefacts (inpaint exposure + alpha fringe) from the intended
parallax motion.

Also reports, per column, the fraction of pixels with error > 15
(exposed-inpaint signature) and the local-gradient ratio
(actual vs ideal) inside the bands.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

W, H = 1920, 1080
CAM_D = 5.0
KX = 0.26 / 0.34
KY = 0.14 / 0.34
PX_PER_WORLD = 540.0
Z = {"layer0": -0.36, "layer1": -0.05, "layer2": 0.15, "layer3": 0.20,
     "layer4": 0.34}
ORDER = ["layer0", "layer1", "layer2", "layer3", "layer4"]

ROOT = os.path.expanduser("~/workspace/ramen-diorama")
OUT = os.path.expanduser("~/workspace/ramen-diorama/analysis/seam-diagnosis/work")


def shift_px(z, px, py):
    persp = CAM_D / (CAM_D - z)
    return (-px * z * KX * PX_PER_WORLD * persp,
            -py * z * KY * PX_PER_WORLD * persp)


def load_scene(slug, layers_dir=None):
    if layers_dir:
        sdir = layers_dir
    elif slug == "ramen":
        sdir = os.path.join(ROOT, "assets")
    else:
        sdir = os.path.join(ROOT, "assets", "scenes", slug)
    src = np.asarray(Image.open(os.path.join(sdir, "source-art.png"))
                     .convert("RGB")).astype(np.float32)
    layers = {}
    import glob
    for f in sorted(glob.glob(os.path.join(sdir, "layers", "layer*.png"))):
        name = os.path.basename(f)
        if "static" in name:
            continue
        lid = "layer" + name.split("-")[0][-1]
        layers[lid] = np.asarray(Image.open(f).convert("RGBA")) \
            .astype(np.float32)
    return src, layers


def warp(rgba, dx, dy):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(rgba, M, (W, H), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT,
                          borderValue=(0, 0, 0, 0))


def composite_from_plates(plates, px, py):
    comp = np.zeros((H, W, 3), np.float32)
    for lid in ORDER:
        w = warp(plates[lid], *shift_px(Z[lid], px, py))
        a = w[..., 3:4] / 255.0
        comp = comp * (1 - a) + w[..., :3] * a
    return comp


def ideal_plates(src, layers):
    """Hard masks from shipped alpha (>127); RGB = source art.
    layer0 = source everywhere (ideal backdrop has no hole)."""
    hard = {}
    taken = np.zeros((H, W), bool)
    for lid in ("layer4", "layer3", "layer2", "layer1"):
        m = (layers[lid][..., 3] > 127) & ~taken
        hard[lid] = m
        taken |= m
    hard["layer0"] = ~taken
    plates = {}
    for lid in ORDER:
        a = hard[lid].astype(np.float32) * 255.0
        plates[lid] = np.dstack([src, a])
    return plates, hard


def bands_from_frac(frac, thresh=0.25, min_width=6):
    """Runs where the column fraction of bad pixels exceeds thresh."""
    above = frac > thresh
    bands, x = [], 0
    while x < W:
        if above[x]:
            x0 = x
            while x < W and above[x]:
                x += 1
            if x - x0 >= min_width:
                bands.append((x0, x))
        else:
            x += 1
    return bands


def grad_mag(img):
    g = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8),
                     cv2.COLOR_RGB2GRAY).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return np.sqrt(gx * gx + gy * gy)


def run(slug, layers_dir=None, tag_prefix=""):
    src, layers = load_scene(slug, layers_dir)
    ideal, hard = ideal_plates(src, layers)
    os.makedirs(OUT, exist_ok=True)
    tests = [
        (0.0, 0.0, "rest"),
        (0.16, -0.8, "picker-rest"),
        (0.16, 0.0, "px+0.16"),
        (-0.16, 0.0, "px-0.16"),
        (0.32, 0.0, "px+0.32"),
        (-0.32, 0.0, "px-0.32"),
        (0.8, 0.0, "px+0.8"),
    ]
    results = {}
    for px, py, tag in tests:
        actual = composite_from_plates(layers, px, py)
        ref = composite_from_plates(ideal, px, py)
        err = np.abs(actual - ref).mean(axis=2)
        bad = (err > 15).astype(np.float32)
        frac = bad.mean(axis=0)
        bands = bands_from_frac(frac)
        # gradient ratio inside bands vs ideal (blur signature)
        ga, gr = grad_mag(actual), grad_mag(ref)
        detail = []
        for (x0, x1) in bands:
            sl = (slice(None), slice(x0, x1))
            m = bad[sl] > 0
            ratio = float(ga[sl][m].mean() / max(gr[sl][m].mean(), 1e-6)) \
                if m.any() else float("nan")
            detail.append((x0, x1, x1 - x0, round(float(err[sl].mean()), 1),
                           round(ratio, 2)))
        print(f"[{slug}] px={px:+.2f} py={py:+.2f}: mean|err| {err.mean():.2f} "
              f"bad-px {bad.mean()*100:.2f}%")
        for d in detail:
            print(f"      BAND x={d[0]:4d}..{d[1]:4d} w={d[2]:3d} "
                  f"err {d[3]:5.1f} grad-ratio {d[4]:.2f}")
        results[tag] = detail
        Image.fromarray(np.clip(actual, 0, 255).astype(np.uint8)).save(
            os.path.join(OUT, f"{slug}-{tag_prefix}{tag}.png"))
        np.save(os.path.join(OUT, f"{slug}-{tag_prefix}{tag}-frac.npy"), frac)
    return results


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "kyoto-matcha"
    layers_dir = sys.argv[2] if len(sys.argv) > 2 else None
    run(slug, layers_dir)
