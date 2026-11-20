"""Slicing / mask tests for the ramen diorama.

Verifies the committed outputs of scripts/slice.py + scripts/depth.py:
layer plates, stencil masks, manifest and depth map. Pure file checks,
no browser needed.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
W, H = 1920, 1080

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok  {name}")
    else:
        print(f" FAIL {name} {detail}")
        failures.append(name)


def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)


def alpha_cov(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3]
    return float((a > 3).mean())


def main():
    print("manifest")
    with open(os.path.join(ASSETS, "manifest.json")) as f:
        manifest = json.load(f)
    check("layers count == 5", len(manifest["layers"]) == 5)
    check("masks count == 7", len(manifest["masks"]) == 7)
    check("anchors present",
          all(k in manifest["anchors"] for k in
              ("eyes", "bowl_center", "lantern_front_pivot", "lantern_rear_pivot",
               "noren_rod", "awning_drips", "counter_top_y")),
          str(sorted(manifest["anchors"].keys())))
    # The manifest's layer coverages are ASSIGNMENT fractions (each pixel
    # belongs to exactly one layer), so they must sum to 1.
    check("manifest layer coverages sum to 1",
          abs(sum(v["coverage"] for v in manifest["layers"].values()) - 1.0) < 0.005)
    zs = {k: v["z"] for k, v in manifest["layers"].items()}
    check("layer z values", zs == {
        "layer0": -0.36, "layer1": -0.05, "layer2": 0.15,
        "layer3": 0.20, "layer4": 0.34}, str(zs))

    print("layers")
    for lid, info in manifest["layers"].items():
        p = os.path.join(ASSETS, info["file"])
        check(f"{lid} exists", os.path.exists(p))
        im = Image.open(p)
        check(f"{lid} size 1920x1080", im.size == (W, H), str(im.size))
        check(f"{lid} has alpha", im.mode == "RGBA", im.mode)
        cov = alpha_cov(p)
        if lid == "layer0":
            # The backdrop is inpainted behind every cutout, so it is opaque
            # everywhere; its 0.448 is the assignment fraction, not alpha.
            check("layer0 is opaque everywhere (inpainted base)", cov > 0.999,
                  f"cov {cov:.3f}")
        else:
            # Feathered edges make alpha coverage slightly larger than the
            # assignment fraction; it must never be smaller.
            check(f"{lid} alpha coverage >= assignment ({info['coverage']:.3f} vs {cov:.3f})",
                  info["coverage"] - 0.005 <= cov <= info["coverage"] + 0.03,
                  f"diff {cov - info['coverage']:.4f}")

    print("layer2-static (noren punched out)")
    p2s = os.path.join(ASSETS, "layers", "layer2-static.png")
    check("layer2-static exists", os.path.exists(p2s))
    a2s = np.asarray(Image.open(p2s).convert("RGBA"))[:, :, 3]
    a2 = np.asarray(Image.open(os.path.join(ASSETS, "layers", "layer2-noren.png")).convert("RGBA"))[:, :, 3]
    # Inside a noren panel the static variant must be transparent.
    check("panel interior is transparent", a2s[400, 900] == 0, f"alpha={a2s[400, 900]}")
    check("panel interior (2nd) is transparent", a2s[400, 1150] == 0, f"alpha={a2s[400, 1150]}")
    # It keeps the non-panel content of layer2 (stall posts): some opacity,
    # and nowhere opaque where layer2 itself is transparent.
    check("static keeps non-panel content", float((a2s > 3).mean()) > 0.05,
          f"cov {float((a2s > 3).mean()):.3f}")
    check("static alpha is a subset of layer2 alpha",
          int(((a2s > 3) & (a2 <= 3)).sum()) == 0)

    print("masks")
    for mid, info in manifest["masks"].items():
        p = os.path.join(ASSETS, info["file"])
        check(f"{mid} exists", os.path.exists(p))
        im = Image.open(p)
        check(f"{mid} size 1920x1080", im.size == (W, H), str(im.size))
        g = np.asarray(im.convert("L"))
        vals = np.unique(g)
        # Hard masks (rain/dry/cloth) are binary; the others are feathered at
        # the edges, so allow a small fraction of intermediate values.
        mid_frac = float(((g > 0) & (g < 255)).mean())
        check(f"{mid} mostly binary (intermediate {mid_frac:.3f} < 0.05)",
              mid_frac < 0.05, str(vals[:8]))
        cov = float((g > 127).mean())
        check(f"{mid} coverage ~ manifest ({info['coverage']:.3f} vs {cov:.3f})",
              abs(cov - info["coverage"]) < 0.005, f"diff {abs(cov - info['coverage']):.4f}")

    print("depth map")
    dp = os.path.join(ASSETS, "depth.png")
    check("depth.png exists", os.path.exists(dp))
    dim = Image.open(dp)
    check("depth size 1920x1080", dim.size == (W, H), str(dim.size))
    d = np.asarray(dim.convert("L")).astype(np.float32)
    check("depth has range", d.min() < 40 and d.max() > 200,
          f"min {d.min()} max {d.max()}")
    # Sanity: the door frame (right edge) is the nearest thing in the scene.
    check("door frame is nearest",
          d[:, 1900:1920].mean() > d[:, 100:300].mean(),
          f"door {d[:, 1900:1920].mean():.0f} vs alley {d[:, 100:300].mean():.0f}")
    # The counter is nearer than the alley street.
    check("counter nearer than alley",
          d[850:1050, 1400:1800].mean() > d[800:1000, 50:400].mean())

    print("rest composite == source art")
    src = load_rgba(os.path.join(ASSETS, "source-art.png"))
    comp = np.zeros((H, W, 4), dtype=np.float32)
    for lid, info in manifest["layers"].items():
        lay = load_rgba(os.path.join(ASSETS, info["file"]))
        a = lay[:, :, 3:4] / 255.0
        comp[:, :, :3] = comp[:, :, :3] * (1 - a) + lay[:, :, :3] * a
        comp[:, :, 3] = np.maximum(comp[:, :, 3], lay[:, :, 3])
    diff = np.abs(comp[:, :, :3] - src[:, :, :3])
    mean = float(diff.mean())
    p99 = float(np.percentile(diff, 99))
    check("composite mean abs diff < 1.0", mean < 1.0, f"mean {mean:.3f}")
    check("composite p99 diff < 20", p99 < 20, f"p99 {p99:.2f}")

    print("round 2: fragment-fetch model (measured layer alpha coverages)")
    # Texture fetches per frame at 1919x998 (1,914,162 visible px),
    # computed from the shipped layer PNGs (alpha > 3 counts as covered).
    # The model is the evidence for the round-2 fixes — and its honest
    # limits: an alpha test discards AFTER the texture fetch, so the
    # lantern alphaTest saves blend/overdraw cost, not fetches; only
    # the woman early-discard (before the 4 CAS neighbour fetches)
    # saves fetches on a plate. The big win is the post pass: MSAA x4
    # multiplied its 5 fetches by 4 (the scene render into postRT was
    # never multisampled — only the post quad changed).
    cov = {}
    for lid, info in manifest["layers"].items():
        cov[lid] = alpha_cov(os.path.join(ASSETS, info["file"]))
    px = 1919 * 998 / 1e6  # megapixels per frame
    # Before: every full-frame plate pays 1 fetch/fragment; the woman
    # plate pays 5 (1 + 4 CAS neighbours); noren strips pay ~coverage;
    # the post pass pays 5 fetches x 4x MSAA.
    before = px * (1 + 1 + 1 + 1 + 5 + cov["layer2"] + 5 * 4)
    # After (high/mid tier): MSAA off (post = 5); woman discards before
    # CAS (1 fetch on transparent, 5 on the covered fraction); lantern
    # plates still fetch (alphaTest is after the fetch) but skip blending.
    after = px * (1 + 1 + 1 + 1 + (1 - cov["layer4"]) + 5 * cov["layer4"]
                  + cov["layer2"] + 5)
    # After (low tier): cheap post is a single fetch (no CAS / heat-haze).
    after_low = after - px * 4
    check("woman plate coverage < 40% (early discard pays off)",
          cov["layer4"] < 0.40, f"cov {cov['layer4']:.3f}")
    check("lantern plates coverage < 5% (alpha test pays off in blend)",
          cov["layer1"] < 0.05 and cov["layer3"] < 0.05,
          f"l1 {cov['layer1']:.3f} l3 {cov['layer3']:.3f}")
    check(f"fragment model high/mid: {after:.1f}M vs {before:.1f}M "
          f"fetches/frame ({after / before:.0%} of before)",
          after < before * 0.45, f"ratio {after / before:.2f}")
    check(f"fragment model low tier: {after_low:.1f}M vs {before:.1f}M "
          f"({after_low / before:.0%} of before)",
          after_low < before * 0.30, f"ratio {after_low / before:.2f}")

    print("phase 2: layer3 holds the front lantern (E2E #3 pin)")
    # The round-2 live re-test reported that unchecking layer3 removed
    # the mist band, not the front lantern. The shipped PNGs say the
    # lantern lives on layer3: inside the front-lantern bbox
    # (x 320-570, y 0-362) layer3 is 82% opaque and layer4 is 0%;
    # the street band has no layer4 alpha either. The mist plane is
    # not a plate at all (a separate mesh with shiftZ -0.2), so no
    # layer toggle can hide it — the E2E observation was a
    # misattribution (animated mist + the emissive glow persisting
    # after the lantern body hid). A live re-check is still needed to
    # close it (see CLAUDE.md).
    a3 = np.asarray(Image.open(os.path.join(
        ASSETS, "layers", "layer3-front-lantern.png")).convert("RGBA"))[:, :, 3]
    a4 = np.asarray(Image.open(os.path.join(
        ASSETS, "layers", "layer4-woman-counter.png")).convert("RGBA"))[:, :, 3]
    a2 = np.asarray(Image.open(os.path.join(
        ASSETS, "layers", "layer2-noren.png")).convert("RGBA"))[:, :, 3]
    check("front-lantern bbox is opaque on layer3",
          float((a3[0:362, 320:570] > 3).mean()) > 0.8,
          f"cov {float((a3[0:362, 320:570] > 3).mean()):.3f}")
    check("front-lantern bbox is transparent on layer4",
          float((a4[0:362, 320:570] > 3).mean()) == 0)
    check("street band has no layer4 alpha",
          float((a4[700:1080, 0:691] > 3).mean()) == 0)
    check("street band has layer2 alpha (noren over the street edge)",
          float((a2[700:1080, 0:691] > 3).mean()) > 0.05,
          f"cov {float((a2[700:1080, 0:691] > 3).mean()):.3f}")

    print()
    if failures:
        print(f"{len(failures)} FAILURES: {failures}")
        sys.exit(1)
    print("all slice tests passed")


if __name__ == "__main__":
    main()
