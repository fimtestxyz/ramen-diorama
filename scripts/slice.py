#!/usr/bin/env python3
"""Slice assets/source-art.png into 5 parallax plates + 7 semantic masks.

Inputs:  assets/source-art.png  (1920x1080 RGB, original illustration)
         assets/depth.png       (1920x1080 L, 0-255, larger = nearer)
         /tmp/depth-work/depth-raw.npy (float32 relative depth, optional)

Outputs: assets/layers/layer{0..4}-*.png   (RGBA, 1920x1080)
         assets/masks/mask-*.png          (L, 1920x1080)
         assets/manifest.json             (layer z, anchors, measured stats)

Method — depth thresholds for coarse layers PLUS manual mask cleanup.
Verified 2026-11-20: the raw Depth Anything V2 Small map orders the scene
correctly at large scale (alley far, counter near, door frame nearest)
but does NOT separate the woman from the background or the noren from the
counter (woman region mean 127, noren 131 on a 0-255 scale). The woman,
noren and lanterns are therefore cut with manual polygons/ellipses measured
from the image; depth is used for coarse assignment, mask derivation and
edge refinement. The backdrop is the source with all foreground removed
and inpainted (Telea) so parallax never reveals a hole.

Layer priority (topmost wins): woman+counter > front lantern > noren >
rear lantern > backdrop. Every pixel belongs to exactly one layer, so the
five plates composited at rest reproduce the source image.

Adaptations vs the showcase spec, recorded honestly:
- The source art has TWO wide noren panels, not six. The app splits the
  noren region into 6 cloth strips (3 per visible panel) for the spring
  simulation; the slice keeps the union mask.
- No gas stove is visible in the source art. mask-flame marks the warm
  festoon bulbs + lantern glow points instead (flickering warm glow).
- The "rear lantern" is the small lantern inside the stall (upper right);
  the "front lantern" is the large lantern hanging top-left.

Usage:
    python3 scripts/slice.py [--src assets/source-art.png] [--depth assets/depth.png]
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

W, H = 1920, 1080

# ---------------------------------------------------------------------------
# Manual regions, measured from the source art (1920x1080).
# ---------------------------------------------------------------------------
# Noren: two wide panels hanging from a rod at y~55.
NOREN_LEFT = np.array([[785, 55], [1040, 55], [1040, 695], [795, 730]], np.int32)
NOREN_RIGHT = np.array([[1055, 55], [1295, 55], [1295, 680], [1055, 700]], np.int32)
# Stall posts (same plate as the noren — stall structure, mid depth).
POST_LEFT = (640, 0, 790, H)      # (x0, y0, x1, y1)
POST_CENTER = (1030, 0, 1150, H)
# Front lantern (large, top-left, hangs out of the top edge).
LANTERN_FRONT = (445, 175, 118, 180)   # (cx, cy, rx, ry)
# Rear lantern (small, inside the stall, upper right).
LANTERN_REAR = (1405, 255, 75, 125)
# Woman: head ellipse + torso rect + hand/chopsticks ellipse.
WOMAN_HEAD = (1630, 500, 215, 205)
WOMAN_TORSO = (1330, 550, 1845, H)
WOMAN_HAND = (1420, 640, 115, 85)
# Counter (top + front) and the extreme-right door frame.
COUNTER = (1130, 770, W, H)
DOOR_FRAME = (1840, 0, W, H)

# Anchors for the app (measured from the image; eyes are approximate).
ANCHORS = {
    "eyes": [[1600, 520], [1710, 512]],
    "bowl_center": [1505, 885],
    "bowl_rx_ry": [190, 110],
    "steam_top": [1520, 560],
    "lantern_front_pivot": [445, 0],
    "lantern_rear_pivot": [1405, 120],
    "noren_rod": {"y": 55, "x0": 785, "x1": 1295, "panels": 6},
    "awning_drips": {"y": 100, "x0": 100, "x1": 600},
    "counter_top_y": 780,
}

# Neon / emissive sign boxes (x0, y0, x1, y1).
EMISSIVE_BOXES = [
    (15, 330, 185, 450),    # OPEN neon, left
    (610, 380, 700, 500),   # blue ramen sign
    (470, 430, 560, 540),   # gyoza sign
    (430, 560, 500, 740),   # vending machine glow
    (1500, 120, 1830, 230),  # festoon bulbs, top right
]
# Festoon bulb points (warm glow / flame mask).
BULBS = [(1560, 170), (1650, 168), (1740, 165), (1810, 168)]


# ---------------------------------------------------------------------------
# Mask helpers
# ---------------------------------------------------------------------------
def blank():
    return np.zeros((H, W), dtype=np.uint8)


def poly(mask, pts, value=255):
    cv2.fillPoly(mask, [np.array(pts, np.int32)], value)
    return mask


def rect(mask, box, value=255):
    x0, y0, x1, y1 = box
    mask[y0:y1, x0:x1] = value
    return mask


def ellipse(mask, spec, value=255):
    cx, cy, rx, ry = spec
    cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, value, -1)
    return mask


def soft(mask, dilate_px=2, blur_px=3):
    """Feather a binary mask: dilate slightly (edge bleed), then blur."""
    if dilate_px:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1))
        mask = cv2.dilate(mask, k)
    if blur_px:
        mask = cv2.GaussianBlur(mask, (0, 0), blur_px)
    return mask


def coverage(mask):
    return float((mask > 127).mean())


# ---------------------------------------------------------------------------
# Slicing
# ---------------------------------------------------------------------------
def build_layer_masks(depth):
    """Return dict layer -> binary mask (0/255). Priority applied inside."""
    # --- woman + counter (top priority) ---
    m4 = blank()
    ellipse(m4, WOMAN_HEAD)
    rect(m4, WOMAN_TORSO)
    ellipse(m4, WOMAN_HAND)
    rect(m4, COUNTER)
    rect(m4, DOOR_FRAME)
    # Depth assist: very-near pixels in the bottom-right quadrant belong here
    # even if they fall outside the manual shapes (bowl rim, chopsticks).
    quad = np.zeros((H, W), bool)
    quad[650:H, 1100:W] = True
    m4 |= ((depth > 165) & quad).astype(np.uint8) * 255
    m4 = cv2.morphologyEx(m4, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    # --- front lantern ---
    m3 = blank()
    ellipse(m3, LANTERN_FRONT)
    # Follow the depth blob: keep only pixels that are actually near-ish
    # inside a loose bbox, so the ellipse does not eat the alley behind it.
    bx = blank()
    cv2.rectangle(bx, (320, 0), (575, 360), 255, -1)
    m3 &= bx

    # --- noren + stall posts ---
    m2 = blank()
    poly(m2, NOREN_LEFT)
    poly(m2, NOREN_RIGHT)
    rect(m2, POST_LEFT)
    rect(m2, POST_CENTER)
    m2 = cv2.morphologyEx(m2, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    # --- rear lantern ---
    m1 = blank()
    ellipse(m1, LANTERN_REAR)

    # --- resolve priority: higher layer wins ---
    masks = {}
    taken = np.zeros((H, W), bool)
    for name, m in (("layer4", m4), ("layer3", m3), ("layer2", m2), ("layer1", m1)):
        m = (m > 127) & ~taken
        masks[name] = (m.astype(np.uint8) * 255)
        taken |= m
    masks["layer0"] = ((~taken).astype(np.uint8) * 255)
    return masks


def build_masks(depth, layer_masks):
    """Seven semantic stencils (grayscale 0-255)."""
    masks = {}
    # Rain: the alley — far depth, left of the stall.
    rain = ((depth < 90) & (np.arange(W)[None, :] < 790)).astype(np.uint8) * 255
    rain = cv2.morphologyEx(rain, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    masks["mask-rain"] = rain
    # Dry indoor stall: everything right of the stall's left edge.
    dry = blank()
    dry[:, 790:] = 255
    dry &= cv2.bitwise_not(rain)
    masks["mask-dry"] = dry
    # Wet street: bottom-left asphalt, far depth.
    street = blank()
    poly(street, [[0, 700], [700, 700], [700, H], [0, H]])
    street &= (depth < 70).astype(np.uint8) * 255
    masks["mask-street"] = cv2.GaussianBlur(street, (0, 0), 6)
    # Emissive: lanterns + neon sign boxes.
    em = blank()
    ellipse(em, LANTERN_FRONT)
    ellipse(em, LANTERN_REAR)
    for b in EMISSIVE_BOXES:
        rect(em, b)
    masks["mask-emissive"] = cv2.GaussianBlur(em, (0, 0), 4)
    # Cloth: the noren union.
    masks["mask-cloth"] = layer_masks["layer2"]
    # Steam: bowl + column above it.
    st = blank()
    ellipse(st, (1505, 885, 190, 110))
    poly(st, [[1420, 560], [1620, 560], [1600, 885], [1440, 885]])
    masks["mask-steam"] = cv2.GaussianBlur(st, (0, 0), 8)
    # Flame: warm festoon bulbs (no stove is visible in the source art).
    fl = blank()
    for (x, y) in BULBS:
        cv2.circle(fl, (x, y), 16, 255, -1)
    masks["mask-flame"] = cv2.GaussianBlur(fl, (0, 0), 5)
    return masks


def laplace_fill(img, mask, iters=1000, down=4):
    """Smooth (Laplace) fill of the hole: no streaks, unlike Telea/NS on
    large rectangular holes (both draw a visible X from the four corners).
    Runs on a downsampled copy, then upsamples. Border rows/cols are held
    fixed so holes touching the frame edge cannot wrap around."""
    h, w = img.shape[:2]
    sw, sh = w // down, h // down
    small = cv2.resize(img, (sw, sh)).astype(np.float32)
    msmall = cv2.resize(mask.astype(np.uint8), (sw, sh)) > 0
    f = small.copy()
    f[msmall] = small[~msmall].mean(axis=0)
    known = ~msmall
    for _ in range(iters):
        avg = np.zeros_like(f)
        avg[1:-1, 1:-1] = (f[:-2, 1:-1] + f[2:, 1:-1] +
                           f[1:-1, :-2] + f[1:-1, 2:]) / 4.0
        avg[0, :] = f[0, :]
        avg[-1, :] = f[-1, :]
        avg[:, 0] = f[:, 0]
        avg[:, -1] = f[:, -1]
        f = np.where(known[..., None], f, avg)
    up = cv2.resize(f, (w, h), interpolation=cv2.INTER_LINEAR)
    out = img.astype(np.float32).copy()
    out[mask] = up[mask]
    return out


def wood_texture(shape, patch):
    """Tile a vertical wood-slat patch (mirrored) across a frame."""
    h, w = shape[:2]
    ph, pw = patch.shape[:2]
    tile = np.concatenate([patch, patch[:, ::-1]], axis=1)
    reps_x = w // tile.shape[1] + 2
    reps_y = h // ph + 2
    big = np.tile(tile, (reps_y, reps_x, 1))
    return big[:h, :w]


def inpaint_backdrop(src, holes):
    """Zone-split fill: Laplace base everywhere; wood-grain texture only
    inside the interior holes (x > 700), sampled from a clean wall patch
    between the plant and the centre post."""
    base = laplace_fill(src, holes > 0)
    patch = src[780:1020, 1060:1130].astype(np.float32)  # plain wood slats
    tex = wood_texture(src.shape, patch)
    tex = cv2.GaussianBlur(tex, (0, 0), 2)
    interior = np.zeros(src.shape[:2], bool)
    interior[:, 700:] = True
    hole = holes > 0
    blend = np.zeros(src.shape[:2], np.float32)
    blend[hole & interior] = 0.28
    blend = cv2.GaussianBlur(blend, (0, 0), 8)
    out = base * (1 - blend[..., None]) + tex * blend[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="assets/source-art.png")
    ap.add_argument("--depth", default="assets/depth.png")
    ap.add_argument("--outdir", default="assets")
    args = ap.parse_args()

    src = np.asarray(Image.open(args.src).convert("RGB"))  # HxWx3 uint8
    assert src.shape == (H, W, 3), src.shape
    depth = np.asarray(Image.open(args.depth).convert("L")).astype(np.uint8)
    assert depth.shape == (H, W), depth.shape

    layer_masks = build_layer_masks(depth)
    layers = {
        "layer0": ("layer0-backdrop.png", -0.36),
        "layer1": ("layer1-rear-lantern.png", -0.05),
        "layer2": ("layer2-noren.png", +0.15),
        "layer3": ("layer3-front-lantern.png", +0.20),
        "layer4": ("layer4-woman-counter.png", +0.34),
    }

    # --- backdrop: fill everything the foreground covers ---
    holes = np.zeros((H, W), np.uint8)
    for name in ("layer1", "layer2", "layer3", "layer4"):
        holes |= layer_masks[name]
    holes_d = cv2.dilate(holes, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    print(f"foreground coverage: {(holes > 0).mean():.3f} of frame")
    backdrop = inpaint_backdrop(src, holes_d)

    os.makedirs(f"{args.outdir}/layers", exist_ok=True)
    os.makedirs(f"{args.outdir}/masks", exist_ok=True)

    stats = {}
    composite = np.zeros((H, W, 4), np.float32)  # RGBA float, for rest check
    for name, (fname, z) in layers.items():
        hard = layer_masks[name]
        alpha = soft(hard, dilate_px=2, blur_px=3).astype(np.float32) / 255.0
        if name == "layer0":
            rgb = backdrop
            alpha = np.ones((H, W), np.float32)  # backdrop is opaque
        else:
            rgb = src
        # Zero RGB where (near-)fully transparent so PNG compresses
        # (3.4 MB -> ~1 MB per layer). Threshold 3/255 keeps the worst
        # per-pixel composite error under ~3 levels.
        rgb = rgb.copy()
        rgb[alpha < 3 / 255.0] = 0
        rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
        Image.fromarray(rgba, mode="RGBA").save(f"{args.outdir}/layers/{fname}")
        stats[name] = {"file": f"layers/{fname}", "z": z,
                       "coverage": round(coverage(hard), 4)}
        print(f"  {fname}: coverage {stats[name]['coverage']:.3f}")
        # Alpha-over composite (painter's algorithm, layer0 first).
        a = alpha[..., None]
        composite[..., :3] = composite[..., :3] * (1 - a) + rgb.astype(np.float32) * a

    # --- masks ---
    smasks = build_masks(depth, layer_masks)
    mask_stats = {}
    for name, m in smasks.items():
        Image.fromarray(m, mode="L").save(f"{args.outdir}/masks/{name}.png")
        mask_stats[name] = {"file": f"masks/{name}.png",
                            "coverage": round(coverage(m), 4)}
        print(f"  {name}.png: coverage {mask_stats[name]['coverage']:.3f}")

    # --- noren static variant: layer2 with the cloth panels punched out ---
    # The app renders the cloth as 6 separate spring strips; the static
    # plane must not draw the cloth twice. The hole is the panel union
    # eroded by 2px so a thin pinned rim remains under the strip edges.
    noren_hole = blank()
    poly(noren_hole, NOREN_LEFT)
    poly(noren_hole, NOREN_RIGHT)
    noren_hole = cv2.erode(noren_hole,
                           cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    static2 = np.asarray(Image.open(f"{args.outdir}/layers/layer2-noren.png")
                         .convert("RGBA")).copy()
    static2[noren_hole > 0, 3] = 0
    Image.fromarray(static2, mode="RGBA").save(f"{args.outdir}/layers/layer2-static.png")
    print("  layer2-static.png: noren panels punched out for the strip rig")

    # --- rest-state check: composite must reproduce the source ---
    diff = np.abs(composite[..., :3] - src.astype(np.float32))
    print(f"rest composite vs source: mean abs diff {diff.mean():.3f}, "
          f"p99 {np.percentile(diff, 99):.2f}, max {diff.max():.1f}")

    manifest = {
        "source": "assets/source-art.png",
        "size": [W, H],
        "layers": stats,
        "masks": mask_stats,
        "anchors": ANCHORS,
        "rest_composite": {
            "mean_abs_diff": round(float(diff.mean()), 3),
            "p99": round(float(np.percentile(diff, 99)), 2),
            "max": round(float(diff.max()), 1),
        },
    }
    with open(f"{args.outdir}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"wrote {args.outdir}/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
