#!/usr/bin/env python3
"""Fix tests for the parallax seam (matcha): small-px sweep (reduced
parallax), bleed variants A/B, and no-inpaint backdrop."""
import os
import sys

import numpy as np

sys.path.insert(0, "/tmp/seamtest")
import repro2

OUT = repro2.OUT


def measure(src, layers, px, py=0.0, label=""):
    ideal, _ = repro2.ideal_plates(src, layers)
    actual = repro2.composite_from_plates(layers, px, py)
    ref = repro2.composite_from_plates(ideal, px, py)
    err = np.abs(actual - ref).mean(axis=2)
    bad = (err > 15).astype(np.float32)
    frac = bad.mean(axis=0)
    bands = repro2.bands_from_frac(frac)
    print(f"  {label} px={px:+.2f}: mean|err| {err.mean():5.2f} "
          f"bad {bad.mean()*100:5.2f}%  bands:", end="")
    if not bands:
        print(" none")
    else:
        print()
        for (x0, x1) in bands:
            sl = (slice(None), slice(x0, x1))
            print(f"      x={x0:4d}..{x1:4d} w={x1-x0:3d} "
                  f"band-err {err[sl].mean():5.1f}")
    return bands, err


def main():
    src, shipped = repro2.load_scene("kyoto-matcha")

    print("== (b) small-px sweep, shipped plates ==")
    for px in (0.02, 0.04, 0.08, 0.12, 0.16):
        measure(src, shipped, px, label="shipped")

    print("== (a) variant A: alpha dilate 12->36, hole radius stays 7 ==")
    _, varA = repro2.load_scene("kyoto-matcha",
                                layers_dir="/tmp/seamtest/variantA")
    for px in (0.16, 0.32, -0.16):
        measure(src, varA, px, label="varA")

    print("== (a) variant B: alpha dilate 12->36 AND hole radius 7->31 ==")
    _, varB = repro2.load_scene("kyoto-matcha",
                                layers_dir="/tmp/seamtest/variantB")
    for px in (0.16, 0.32, -0.16):
        measure(src, varB, px, label="varB")

    print("== (c) no-inpaint backdrop: layer0 RGB = source art ==")
    noinpaint = dict(shipped)
    l0 = shipped["layer0"].copy()
    l0[..., :3] = src
    noinpaint["layer0"] = l0
    for px in (0.16, 0.32, -0.16):
        measure(src, noinpaint, px, label="noinpaint")


if __name__ == "__main__":
    main()
