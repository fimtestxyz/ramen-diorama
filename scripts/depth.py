#!/usr/bin/env python3
"""Generate assets/depth.png from assets/source-art.png.

Model: Depth Anything V2 Small (onnx-community/depth-anything-v2-small),
Apache 2.0. Same weights the browser app loads via @huggingface/transformers.

NOTE — why Python and not Node: the intended route was Node +
@huggingface/transformers, but on this VM the install fails twice:
(1) onnxruntime-node's postinstall script reports a corrupt package.json,
(2) retry fails with ECONNRESET to api.nuget.org (the native-binary host).
The model weights are identical; only the runtime differs (Python
onnxruntime 1.32 instead of onnxruntime-node). The browser app still uses
@huggingface/transformers as specified in spec.md.

Preprocessing follows the model's preprocessor_config.json (DPTImageProcessor):
resize keeping aspect ratio to fit 518x518 (multiple of 14), rescale /255,
normalize with ImageNet mean/std. Output is relative depth (larger = nearer),
min-max normalized to 0-255 grayscale, upsampled to the source resolution.

Usage:
    python3 scripts/depth.py [--model model_quantized.onnx] [--out assets/depth.png]
"""
import argparse
import os
import sys
import time

import numpy as np
from PIL import Image

MODEL_URL = ("https://huggingface.co/onnx-community/depth-anything-v2-small"
             "/resolve/main/onnx/model_quantized.onnx")
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
TARGET = 518  # longest side target (preprocessor size 518x518, keep aspect)


def round14(n):
    return int(round(n / 14.0)) * 14


def preprocess(rgb, target=TARGET):
    """rgb: HxWx3 uint8. Returns CHW float32 tensor [1,3,h,w] and (h, w)."""
    h, w = rgb.shape[:2]
    scale = target / max(h, w)
    nh, nw = round14(int(round(h * scale))), round14(int(round(w * scale)))
    img = Image.fromarray(rgb).resize((nw, nh), Image.BILINEAR)
    arr = np.asarray(img).astype(np.float32) / 255.0
    arr = (arr - MEAN) / STD
    arr = np.transpose(arr, (2, 0, 1))[None, :, :, :]
    return np.ascontiguousarray(arr), (nh, nw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="/tmp/depth-work/model_quantized.onnx")
    ap.add_argument("--src", default="assets/source-art.png")
    ap.add_argument("--out", default="assets/depth.png")
    ap.add_argument("--raw", default="/tmp/depth-work/depth-raw.npy")
    ap.add_argument("--work-w", type=int, default=960,
                    help="working width for the depth output before upsampling")
    args = ap.parse_args()

    import onnxruntime as ort

    src = Image.open(args.src).convert("RGB")
    rgb = np.asarray(src)
    H, W = rgb.shape[:2]
    print(f"source: {W}x{H}")

    if not os.path.exists(args.model):
        print(f"model not found: {args.model}\nfetch it from:\n  {MODEL_URL}")
        return 1

    tensor, (nh, nw) = preprocess(rgb)
    print(f"model input: {nw}x{nh}")

    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.inter_op_num_threads = 1
    sess = ort.InferenceSession(args.model, so, providers=["CPUExecutionProvider"])
    print("inputs:", [(i.name, i.shape, i.type) for i in sess.get_inputs()])
    print("outputs:", [(o.name, o.shape, o.type) for o in sess.get_outputs()])

    t0 = time.time()
    out = sess.run(None, {sess.get_inputs()[0].name: tensor})
    dt = time.time() - t0
    depth = out[0][0]  # [h, w] float32, larger = nearer
    # (the ONNX output has no channel dim: [batch, height, width])
    print(f"inference: {dt:.1f}s  depth shape {depth.shape} "
          f"range {depth.min():.3f}..{depth.max():.3f} mean {depth.mean():.3f}")

    # Upsample to working width (960), then to full source resolution.
    work_h = int(round(args.work_w * H / W))
    d_img = Image.fromarray(depth.astype(np.float32), mode="F")
    d_work = d_img.resize((args.work_w, work_h), Image.BILINEAR)
    d_full = d_img.resize((W, H), Image.BILINEAR)
    np.save(args.raw, np.asarray(d_full, dtype=np.float32))

    # Min-max normalize to 0..255 grayscale (larger = nearer = brighter).
    arr = np.asarray(d_full, dtype=np.float32)
    lo, hi = float(arr.min()), float(arr.max())
    norm = ((arr - lo) / (hi - lo) * 255.0).astype(np.uint8)
    Image.fromarray(norm, mode="L").save(args.out)
    print(f"wrote {args.out} ({W}x{H})  normalized range 0..255")

    # Region means (fractions of W/H) — quick separation sanity check.
    def region(x0, y0, x1, y1, name):
        a = norm[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]
        print(f"  {name:28s} mean {a.mean():6.1f}  std {a.std():5.1f}")

    region(0.02, 0.55, 0.30, 0.95, "alley street (far)")
    region(0.02, 0.05, 0.30, 0.45, "alley buildings (far)")
    region(0.42, 0.10, 0.66, 0.65, "noren curtains (mid)")
    region(0.60, 0.25, 0.70, 0.55, "interior shelves (mid)")
    region(0.74, 0.30, 0.95, 0.62, "woman head/torso (near?)")
    region(0.68, 0.78, 0.90, 0.92, "counter + bowl (near)")
    region(0.95, 0.05, 1.00, 0.95, "door frame right (nearest?)")
    region(0.17, 0.00, 0.30, 0.32, "front lantern (near)")
    region(0.69, 0.12, 0.77, 0.35, "rear lantern (mid)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
