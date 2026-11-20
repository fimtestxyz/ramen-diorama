"""Slicing / mask tests for the 5 new diorama scenes.

Verifies the committed outputs of scripts/slice_scene.py + scripts/depth.py
for every scene in scripts/scenes.json: layer plates, stencil masks,
manifest and depth map, with the same checks as the ramen scene
(test/slices.test.py). Pure file checks, no browser needed.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENES_DIR = os.path.join(ROOT, "assets", "scenes")
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


def test_scene(slug, cfg):
    sdir = os.path.join(SCENES_DIR, slug)
    print(f"== {slug} ({cfg['name']}) ==")

    print("source art")
    sp = os.path.join(sdir, "source-art.png")
    check("source-art.png exists", os.path.exists(sp))
    sim = Image.open(sp)
    check("source-art 1920x1080", sim.size == (W, H), str(sim.size))
    check("source-art is RGB", sim.mode == "RGB", sim.mode)

    print("manifest")
    with open(os.path.join(sdir, "manifest.json")) as f:
        manifest = json.load(f)
    check("manifest scene == slug", manifest["scene"] == slug)
    check("layers count == 5", len(manifest["layers"]) == 5)
    check("masks count == 7", len(manifest["masks"]) == 7)
    check("anchors present",
          all(k in manifest["anchors"] for k in cfg["required_anchors"]),
          str(sorted(manifest["anchors"].keys())))
    check("manifest layer coverages sum to 1",
          abs(sum(v["coverage"] for v in manifest["layers"].values()) - 1.0) < 0.005)
    zs = {k: v["z"] for k, v in manifest["layers"].items()}
    check("layer z values", zs == {
        "layer0": -0.36, "layer1": -0.05, "layer2": 0.15,
        "layer3": 0.20, "layer4": 0.34}, str(zs))
    check("manifest cloth_layer matches config",
          manifest["cloth_layer"] == cfg["cloth_layer"])

    print("layers")
    for lid, info in manifest["layers"].items():
        p = os.path.join(sdir, info["file"])
        check(f"{lid} exists", os.path.exists(p))
        im = Image.open(p)
        check(f"{lid} size 1920x1080", im.size == (W, H), str(im.size))
        check(f"{lid} has alpha", im.mode == "RGBA", im.mode)
        cov = alpha_cov(p)
        if lid == "layer0":
            check("layer0 is opaque everywhere (inpainted base)",
                  cov > 0.999, f"cov {cov:.3f}")
        else:
            # The 12px edge bleed (see soft() in scripts/slice.py)
            # grows thin layers the most — osaka layer2 gains +0.051 —
            # so the upper bound is +0.08, not the old +0.03.
            check(f"{lid} alpha coverage >= assignment "
                  f"({info['coverage']:.3f} vs {cov:.3f})",
                  info["coverage"] - 0.005 <= cov <= info["coverage"] + 0.08,
                  f"diff {cov - info['coverage']:.4f}")

    print("cloth static variant")
    cloth = cfg["cloth_layer"]
    punch = cfg["punch_polys"]
    if cloth and punch:
        check("manifest static_file set", manifest["static_file"] is not None)
        p2s = os.path.join(sdir, manifest["static_file"])
        check("static file exists", os.path.exists(p2s))
        a2s = np.asarray(Image.open(p2s).convert("RGBA"))[:, :, 3]
        cloth_file = manifest["layers"][cloth]["file"]
        a2 = np.asarray(Image.open(os.path.join(sdir, cloth_file))
                        .convert("RGBA"))[:, :, 3]
        x, y = cfg["punch_test_point"]
        check("punch test point is transparent", a2s[y, x] == 0,
              f"alpha={a2s[y, x]}")
        check("static keeps non-panel content",
              float((a2s > 3).mean()) > 0.05,
              f"cov {float((a2s > 3).mean()):.3f}")
        check("static alpha is a subset of cloth layer alpha",
              int(((a2s > 3) & (a2 <= 3)).sum()) == 0)
    else:
        check("manifest static_file is null", manifest["static_file"] is None)
        check("no static file on disk",
              not os.path.exists(os.path.join(sdir, "layers",
                                              "layer2-static.png"))
              and not os.path.exists(os.path.join(sdir, "layers",
                                                  "layer3-static.png")))

    print("masks")
    for mid, info in manifest["masks"].items():
        p = os.path.join(sdir, info["file"])
        check(f"{mid} exists", os.path.exists(p))
        im = Image.open(p)
        check(f"{mid} size 1920x1080", im.size == (W, H), str(im.size))
        g = np.asarray(im.convert("L"))
        mid_frac = float(((g > 0) & (g < 255)).mean())
        check(f"{mid} mostly binary (intermediate {mid_frac:.3f} < 0.05)",
              mid_frac < 0.05)
        cov = float((g > 127).mean())
        check(f"{mid} coverage ~ manifest ({info['coverage']:.3f} vs {cov:.3f})",
              abs(cov - info["coverage"]) < 0.005,
              f"diff {abs(cov - info['coverage']):.4f}")

    print("depth map")
    dp = os.path.join(sdir, "depth.png")
    check("depth.png exists", os.path.exists(dp))
    dim = Image.open(dp)
    check("depth size 1920x1080", dim.size == (W, H), str(dim.size))
    d = np.asarray(dim.convert("L")).astype(np.float32)
    check("depth has range", d.min() < 40 and d.max() > 200,
          f"min {d.min()} max {d.max()}")
    for dc in cfg["depth_checks"]:
        x0, y0, x1, y1 = dc["rect"]
        mean = float(d[y0:y1, x0:x1].mean())
        if "mean_gt" in dc:
            check(f"depth: {dc['name']} (mean {mean:.0f} > {dc['mean_gt']})",
                  mean > dc["mean_gt"], f"mean {mean:.1f}")
        if "mean_lt" in dc:
            check(f"depth: {dc['name']} (mean {mean:.0f} < {dc['mean_lt']})",
                  mean < dc["mean_lt"], f"mean {mean:.1f}")

    print("rest composite == source art")
    src = load_rgba(sp)
    comp = np.zeros((H, W, 4), dtype=np.float32)
    for lid, info in manifest["layers"].items():
        lay = load_rgba(os.path.join(sdir, info["file"]))
        a = lay[:, :, 3:4] / 255.0
        comp[:, :, :3] = comp[:, :, :3] * (1 - a) + lay[:, :, :3] * a
        comp[:, :, 3] = np.maximum(comp[:, :, 3], lay[:, :, 3])
    diff = np.abs(comp[:, :, :3] - src[:, :, :3])
    mean = float(diff.mean())
    p99 = float(np.percentile(diff, 99))
    check("composite mean abs diff < 1.0", mean < 1.0, f"mean {mean:.3f}")
    check("composite p99 diff < 20", p99 < 20, f"p99 {p99:.2f}")

    print("minified composite == minified source (12px edge bleed)")
    # Same simulation as test/slices.test.py: the renderer's texture
    # minification at rest (1.18x overscan) blurs the alpha edges, and
    # with the old 2px bleed the inpainted backdrop leaked at every
    # layer boundary (0.5-0.9% of pixels off by >12 — the blurred
    # rectangular seams). With the 12px bleed the coverage stays ~1
    # at the true boundary: 0.00%.
    def resample(im):
        return np.asarray(
            Image.fromarray(im).resize((1627, 915), Image.BILINEAR)
            .resize((W, H), Image.BILINEAR))
    src_min = resample(src[:, :, :3].astype(np.uint8)).astype(np.float32)
    comp_min = np.zeros((H, W, 3), dtype=np.float32)
    for lid, info in manifest["layers"].items():
        lay = np.asarray(Image.open(os.path.join(sdir, info["file"]))
                         .convert("RGBA"))
        lay = resample(lay).astype(np.float32)
        a = lay[:, :, 3:4] / 255.0
        comp_min = comp_min * (1 - a) + lay[:, :, :3] * a
    mdiff = np.abs(comp_min - src_min).mean(axis=2)
    check("minified composite mean diff < 0.15",
          float(mdiff.mean()) < 0.15, f"mean {float(mdiff.mean()):.3f}")
    check("minified composite: no pixel off by >12",
          float((mdiff > 12).mean()) == 0.0,
          f"px>12 {float((mdiff > 12).mean()) * 100:.3f}%")

    print("fragment model (same formula as the ramen model in slices.test.py)")
    # Texture fetches per frame at 1919x998, from the shipped layer
    # PNGs. Rig scenes (osaka, matcha) pay 5 fetches on layer4 before
    # and discard before the CAS neighbours after; plain scenes pay 1.
    # Rig scenes are the ones with a `rig` entry in the SCENES registry
    # in index.html — enoden HAS eyes in its manifest but is
    # deliberately NOT rigged (the passenger is 20 px wide; a blink
    # would squash half the figure), so it counts as a plain plate.
    cov = {}
    for lid, info in manifest["layers"].items():
        cov[lid] = alpha_cov(os.path.join(sdir, info["file"]))
    px = 1919 * 998 / 1e6
    cloth_cov = cov[cloth] if cloth else 0.0
    rig = slug in ("osaka-cafe", "kyoto-matcha")
    if rig:
        before = px * (29 + cloth_cov)
        after = px * (10 + 4 * cov["layer4"] + cloth_cov)
    else:
        before = px * (25 + cloth_cov)
        after = px * (10 + cloth_cov)
    after_low = after - px * 4
    check(f"fragment model high/mid: {after:.1f}M vs {before:.1f}M "
          f"({after / before:.0%} of before)",
          after < before * 0.45, f"ratio {after / before:.2f}")
    check(f"fragment model low tier: {after_low:.1f}M vs {before:.1f}M "
          f"({after_low / before:.0%} of before)",
          after_low < before * 0.30, f"ratio {after_low / before:.2f}")
    print()


def main():
    with open(os.path.join(ROOT, "scripts", "scenes.json")) as f:
        cfg = json.load(f)["scenes"]
    check("8 scenes configured", len(cfg) == 8, f"got {len(cfg)}")
    for slug in sorted(cfg):
        test_scene(slug, cfg[slug])
    if failures:
        print(f"{len(failures)} FAILURES: {failures}")
        sys.exit(1)
    print("all scene tests passed")


if __name__ == "__main__":
    main()
