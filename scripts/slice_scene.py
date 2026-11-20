#!/usr/bin/env python3
"""Slice new diorama scenes (assets/scenes/<slug>/) into 5 parallax
plates + 7 semantic masks, mirroring the ramen scene's layout.

Generalizes scripts/slice.py: all per-scene geometry lives in
scripts/scenes.json (manual shapes measured from each scene's art +
depth assists), so the ramen thresholds are never reused blindly.
The depth map is coarse (V2 Small) — manual shapes carry the layering;
depth is used for coarse assignment, mask derivation and edge refinement.

Inputs per scene:  assets/scenes/<slug>/source-art.png (1920x1080 RGB)
                    assets/scenes/<slug>/depth.png     (1920x1080 L, 0-255)
Outputs:            assets/scenes/<slug>/layers/*.png  (RGBA, 1920x1080)
                    assets/scenes/<slug>/masks/*.png   (L, 1920x1080)
                    assets/scenes/<slug>/manifest.json
                    assets/scenes/<slug>/layers/layer<N>-static.png
                      (only when the scene has cloth punch polygons:
                      the cloth layer with its panels punched out, for
                      the strip rig — same idea as the ramen noren.)

Layer priority (topmost wins): layer4 > layer3 > layer2 > layer1 >
layer0 (backdrop). Every pixel belongs to exactly one layer, so the
five plates composited at rest reproduce the source image.

Usage:
    python3 scripts/slice_scene.py --scene osaka-cafe
    python3 scripts/slice_scene.py --all
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import slice as ramen_slice  # noqa: E402  (helpers only; main is guarded)

import cv2
import numpy as np
from PIL import Image

W, H = 1920, 1080
Z = {"layer0": -0.36, "layer1": -0.05, "layer2": 0.15, "layer3": 0.20,
     "layer4": 0.34}
LAYER_ORDER = ["layer4", "layer3", "layer2", "layer1"]  # priority order

blank = ramen_slice.blank
poly = ramen_slice.poly
rect = ramen_slice.rect
ellipse = ramen_slice.ellipse
soft = ramen_slice.soft
coverage = ramen_slice.coverage
laplace_fill = ramen_slice.laplace_fill
wood_texture = ramen_slice.wood_texture


def apply_shape(mask, shape):
    """One shape dict: {"e": [cx,cy,rx,ry]} / {"r": [x0,y0,x1,y1]} /
    {"p": [[x,y], ...]}."""
    if "e" in shape:
        return ellipse(mask, shape["e"])
    if "r" in shape:
        return rect(mask, shape["r"])
    if "p" in shape:
        return poly(mask, shape["p"])
    raise ValueError(f"unknown shape {shape}")


def build_layer_masks(cfg, depth):
    masks = {}
    taken = np.zeros((H, W), bool)
    for name in LAYER_ORDER:
        spec = cfg["layers"][name]
        m = blank()
        for s in spec["shapes"]:
            apply_shape(m, s)
        if "depth_assist" in spec:
            da = spec["depth_assist"]
            x0, y0, x1, y1 = da["rect"]
            quad = np.zeros((H, W), bool)
            quad[y0:y1, x0:x1] = True
            m |= ((depth > da["threshold"]) & quad).astype(np.uint8) * 255
        if spec.get("close"):
            k = spec["close"]
            m = cv2.morphologyEx(
                m, cv2.MORPH_CLOSE,
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        m = (m > 127) & ~taken
        masks[name] = m.astype(np.uint8) * 255
        taken |= m
    masks["layer0"] = ((~taken).astype(np.uint8) * 255)
    return masks


def build_mask(spec, depth, layer_masks):
    """One mask spec (see scenes.json). Returns a grayscale mask."""
    kind = spec["kind"]
    if kind == "depth_rect":
        m = blank()
        rect(m, spec["rect"])
        return ((depth < spec["below"]) & (m > 0)).astype(np.uint8) * 255
    if kind == "depth_poly":
        m = blank()
        poly(m, spec["poly"])
        return ((depth < spec["below"]) & (m > 0)).astype(np.uint8) * 255
    if kind == "rect":
        m = blank()
        return rect(m, spec["rect"])
    if kind == "poly":
        m = blank()
        return poly(m, spec["poly"])
    if kind == "all_minus":
        m = np.full((H, W), 255, dtype=np.uint8)
        for p in spec["polys"]:
            tmp = blank()
            poly(tmp, p)
            m[tmp > 0] = 0
        return m
    if kind == "union":
        m = blank()
        for part in spec["parts"]:
            m |= build_mask(part, depth, layer_masks)
        return m
    if kind == "shapes":
        m = blank()
        for s in spec["shapes"]:
            apply_shape(m, s)
        return m
    if kind == "points":
        m = blank()
        for (x, y) in spec["points"]:
            cv2.circle(m, (x, y), spec.get("r", 16), 255, -1)
        return m
    if kind == "layer":
        return layer_masks[spec["layer"]].copy()
    raise ValueError(f"unknown mask kind {kind}")


def build_masks(cfg, depth, layer_masks):
    out = {}
    for name, spec in cfg["masks"].items():
        m = build_mask(spec, depth, layer_masks)
        if spec.get("blur"):
            m = cv2.GaussianBlur(m, (0, 0), spec["blur"])
        out[name] = m
    return out


def inpaint_backdrop(src, holes, cfg):
    """Laplace base everywhere; texture patch blended inside the
    configured interior rect (same idea as the ramen slicer, but the
    patch rect and interior region are per-scene)."""
    base = laplace_fill(src, holes > 0)
    inc = cfg.get("inpaint")
    if not inc:
        return base
    y0, y1, x0, x1 = inc["patch"]
    patch = src[y0:y1, x0:x1].astype(np.float32)
    tex = wood_texture(src.shape, patch)
    tex = cv2.GaussianBlur(tex, (0, 0), 2)
    ix0, iy0, ix1, iy1 = inc["interior_rect"]
    interior = np.zeros(src.shape[:2], bool)
    interior[iy0:iy1, ix0:ix1] = True
    hole = holes > 0
    blend = np.zeros(src.shape[:2], np.float32)
    blend[hole & interior] = inc.get("blend", 0.28)
    blend = cv2.GaussianBlur(blend, (0, 0), 8)
    out = base * (1 - blend[..., None]) + tex * blend[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def slice_scene(slug, cfg, root):
    sdir = os.path.join(root, "assets", "scenes", slug)
    src = np.asarray(Image.open(os.path.join(sdir, "source-art.png"))
                     .convert("RGB"))
    assert src.shape == (H, W, 3), src.shape
    depth = np.asarray(Image.open(os.path.join(sdir, "depth.png"))
                       .convert("L")).astype(np.uint8)
    assert depth.shape == (H, W), depth.shape

    layer_masks = build_layer_masks(cfg, depth)
    layers = {}
    for lid in ("layer0", "layer1", "layer2", "layer3", "layer4"):
        layers[lid] = (cfg["layers"].get(lid, {}).get("file")
                       if lid != "layer0" else "layer0-backdrop.png",
                       Z[lid])
    # layer0 has no config entry (it is the rest); fill its file name.
    layers["layer0"] = ("layer0-backdrop.png", -0.36)

    holes = np.zeros((H, W), np.uint8)
    for name in LAYER_ORDER:
        holes |= layer_masks[name]
    holes_d = cv2.dilate(holes, cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (15, 15)))
    # 15 px: the layer alpha is dilated 12 px (see soft() in slice.py),
    # so the backdrop must be inpainted at least that far out, or the
    # foreground ghost would show during parallax.
    print(f"[{slug}] foreground coverage: {(holes > 0).mean():.3f} of frame")
    backdrop = inpaint_backdrop(src, holes_d, cfg)

    os.makedirs(os.path.join(sdir, "layers"), exist_ok=True)
    os.makedirs(os.path.join(sdir, "masks"), exist_ok=True)

    stats = {}
    composite = np.zeros((H, W, 4), np.float32)
    for name in ("layer0", "layer1", "layer2", "layer3", "layer4"):
        fname, z = layers[name]
        hard = layer_masks[name]
        alpha = soft(hard, dilate_px=12, blur_px=3).astype(np.float32) / 255.0
        if name == "layer0":
            rgb = backdrop
            alpha = np.ones((H, W), np.float32)
        else:
            rgb = src
        rgb = rgb.copy()
        rgb[alpha < 3 / 255.0] = 0
        rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
        Image.fromarray(rgba, mode="RGBA").save(
            os.path.join(sdir, "layers", fname))
        stats[name] = {"file": f"layers/{fname}", "z": z,
                       "coverage": round(coverage(hard), 4)}
        print(f"[{slug}]   {fname}: coverage {stats[name]['coverage']:.3f}")
        a = alpha[..., None]
        composite[..., :3] = (composite[..., :3] * (1 - a)
                              + rgb.astype(np.float32) * a)

    smasks = build_masks(cfg, depth, layer_masks)
    mask_stats = {}
    for name, m in smasks.items():
        Image.fromarray(m, mode="L").save(
            os.path.join(sdir, "masks", f"{name}.png"))
        mask_stats[name] = {"file": f"masks/{name}.png",
                            "coverage": round(coverage(m), 4)}
        print(f"[{slug}]   {name}.png: coverage "
              f"{mask_stats[name]['coverage']:.3f}")

    # --- cloth static variant (panels punched out for the strip rig) ---
    static_file = None
    cloth_layer = cfg.get("cloth_layer")
    punch = cfg.get("punch_polys")
    if cloth_layer and punch:
        hole = blank()
        for p in punch:
            poly(hole, p)
        hole = cv2.erode(hole, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (5, 5)))
        n = cloth_layer[-1]  # "layer3" -> "3"
        static_file = f"layer{n}-static.png"
        src_png = os.path.join(
            sdir, "layers", stats[cloth_layer]["file"].split("/")[-1])
        static = np.asarray(Image.open(src_png).convert("RGBA")).copy()
        static[hole > 0, 3] = 0
        Image.fromarray(static, mode="RGBA").save(
            os.path.join(sdir, "layers", static_file))
        print(f"[{slug}]   {static_file}: cloth panels punched out")

    diff = np.abs(composite[..., :3] - src.astype(np.float32))
    print(f"[{slug}] rest composite vs source: mean abs diff "
          f"{diff.mean():.3f}, p99 {np.percentile(diff, 99):.2f}, "
          f"max {diff.max():.1f}")

    manifest = {
        "scene": slug,
        "name": cfg["name"],
        "source": f"assets/scenes/{slug}/source-art.png",
        "size": [W, H],
        "layers": stats,
        "masks": mask_stats,
        "anchors": cfg["anchors"],
        "cloth_layer": cloth_layer,
        "static_file": (f"layers/{static_file}" if static_file else None),
        "rest_composite": {
            "mean_abs_diff": round(float(diff.mean()), 3),
            "p99": round(float(np.percentile(diff, 99)), 2),
            "max": round(float(diff.max()), 1),
        },
    }
    with open(os.path.join(sdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[{slug}] wrote {sdir}/manifest.json")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--config", default="scripts/scenes.json")
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, args.config)) as f:
        cfg = json.load(f)["scenes"]

    if args.all:
        slugs = sorted(cfg)
    elif args.scene:
        slugs = [args.scene]
    else:
        ap.error("pass --scene <slug> or --all")
    for slug in slugs:
        if slug not in cfg:
            print(f"unknown scene: {slug}")
            return 1
        slice_scene(slug, cfg[slug], root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
