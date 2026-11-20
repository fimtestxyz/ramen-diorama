# Ramen Diorama — 深夜拉麵 2.5D Living Diorama

One static anime illustration → a living 60 fps interactive diorama.
No AI video, no looping MP4s, no external audio files, no cloud cost.

Faithful to the Shinya Ramen showcase spec, built in one pass. See
[`spec.md`](spec.md) for the full spec, decisions, and acceptance criteria.

## Status

Spec stage. Source art generated (`assets/source-art.png`, 1920×1080,
original illustration). Build starts after the source art is confirmed.

## Pipeline

1. **Source art** — one 16:9 anime illustration (`assets/source-art.png`).
2. **Depth** — Depth Anything V2 Small, in-browser via
   `@huggingface/transformers` (`depth-estimation` pipeline,
   `onnx-community/depth-anything-v2-small`), Web Worker, Cache API.
   ~27 MB int8, cached after first load. Apache 2.0.
3. **Slicing** — offline one-off `scripts/slice.py` (Python + OpenCV):
   source art + depth map → five parallax plates + seven semantic masks,
   inpainted backdrop behind cutouts. Outputs committed to
   `assets/layers/` + `assets/masks/`.
4. **Rendering** — Three.js via CDN, WebGL2, single `index.html`,
   no build step. Five depth plates, eleven shader passes, tactile
   physics, procedural Web Audio.
5. **Hosting** — Vercel + GitHub Pages backup,
   custom domain `ramen.gobblemon.com` (planned).

## Run it

Static site — serve the folder (`python3 -m http.server`) and open
`index.html`, or open the deployed URL. The image and the depth model
never leave the device.

## Files

- `spec.md` — the spec (decisions, features, acceptance criteria)
- `index.html` — the whole app (to be built)
- `assets/source-art.png` — the source illustration
- `assets/layers/`, `assets/masks/` — sliced plates + stencils (to be built)
- `scripts/slice.py` — offline slicing + inpainting (to be built)
- `test/` — headless checks
- `CLAUDE.md` — agent notes for this repo
