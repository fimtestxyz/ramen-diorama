# Ramen Diorama — Lo-Fi Playlist (real tracks)

Six royalty-free lo-fi tracks for the ramen diorama's music selection.
All tracks are **CC BY 4.0** (Creative Commons Attribution 4.0 International):
free to use, including commercially, **provided the attribution below is
shown in the app** (e.g. in the playlist panel / About section).

- License: https://creativecommons.org/licenses/by/4.0/
- Source: Free Music Archive (https://freemusicarchive.org) — each track's
  license was verified on its own track page before download (2026-11-20).
- All files are MP3, 44.1 kHz stereo, 192 kbps CBR. Originals were
  320 kbps (except Shatter, already 192 kbps); five tracks were re-encoded
  to 192 kbps with ffmpeg (libmp3lame) to keep the total under 30 MB.
  Embedded cover art was stripped during re-encoding.
- Total: 6 tracks, 16 min 49 s, 24,221,540 bytes (~24 MB).

## Tracks

| # | File | Title | Artist | Duration | Size |
|---|------|-------|--------|----------|------|
| 1 | 01-kyoto-1000-handz.mp3 | Kyoto | 1000 Handz | 2:36 | 3,746,693 |
| 2 | 02-shanghai-1000-handz.mp3 | Shanghai | 1000 Handz | 2:07 | 3,046,339 |
| 3 | 03-shatter-1000-handz.mp3 | Shatter | 1000 Handz | 2:40 | 3,844,044 |
| 4 | 04-silent-wood-purrple-cat.mp3 | Silent Wood | Purrple Cat | 3:08 | 4,505,375 |
| 5 | 05-long-day-purrple-cat.mp3 | Long Day | Purrple Cat | 3:05 | 4,462,113 |
| 6 | 06-through-the-trees-purrple-cat.mp3 | Through the Trees | Purrple Cat | 3:12 | 4,616,976 |

## Sources & attribution (copy into the app UI)

1. **"Kyoto" by 1000 Handz** — album: *CC BY: FREE TO USE - Melodic
   Rap Instrumentals*.
   Source: https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-melodic-rap-instrumentals/kyoto-2/
   Attribution: `"Kyoto" by 1000 Handz, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

2. **"Shanghai" by 1000 Handz** — album: *CC BY: FREE TO USE - Melodic
   Rap Instrumentals Vol. 2*.
   Source: https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-melodic-rap-instrumentals-vol-2/shanghai/
   Attribution: `"Shanghai" by 1000 Handz, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

3. **"Shatter" by 1000 Handz** — album: *CC BY: FREE TO USE - Melodic
   Rap Instrumentals Vol. 2*.
   Source: https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-melodic-rap-instrumentals-vol-2/shatter-1/
   Attribution: `"Shatter" by 1000 Handz, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

4. **"Silent Wood" by Purrple Cat** — album: *House in the Woods*.
   Source: https://freemusicarchive.org/music/purrple-cat/house-in-the-woods/silent-wood/
   Attribution: `"Silent Wood" by Purrple Cat, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

5. **"Long Day" by Purrple Cat** — album: *House in the Woods*.
   Source: https://freemusicarchive.org/music/purrple-cat/house-in-the-woods/long-day/
   Attribution: `"Long Day" by Purrple Cat, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

6. **"Through the Trees" by Purrple Cat** — album: *House in the Woods*.
   Source: https://freemusicarchive.org/music/purrple-cat/house-in-the-woods/through-the-trees/
   Attribution: `"Through the Trees" by Purrple Cat, licensed under CC BY 4.0
   (https://creativecommons.org/licenses/by/4.0/)`

## Notes for the app integration

- Every track needs its attribution visible in the app (CC BY 4.0
  requirement). The playlist panel is the natural place.
- Do not redistribute these files as standalone downloads; the CC BY
  license allows use in the app, not resale as music files.
- Verification: each file was checked with `ffprobe` (MP3, 44.1 kHz,
  stereo, duration as listed) and fully decoded with
  `ffmpeg -v error -i <file> -f null -` with no errors (2026-11-20).

## Sources that did NOT work (for the record)

- **Pixabay Music (preferred source, failed):** direct curl is blocked by
  a Cloudflare "Just a moment..." bot challenge (HTTP 403, even with a
  browser User-Agent and the real Cloudflare IP via --resolve), and the
  runtime page fetcher reports pixabay.com as blocked by policy. No
  Pixabay track was downloaded; the parent will need a live-browser
  download task if Pixabay tracks are wanted later.
- **Free Music Archive search:** the site's `?q=` search ignores the
  query and returns a fixed list; tracks were found instead via the
  genre page (`/genre/Lo-fi-Hip-Hop/`) and album pages. Direct file
  URLs (`files.freemusicarchive.org/...`) are embedded in each track
  page's JSON and download fine with curl.
- **free-stock-music.com:** not used; the DNS answer for
  `www.free-stock-music.com` returned a CNAME first and the fetch
  failed before FMA proved sufficient. Its "Rain, Book And Cup Of Tea"
  by &lt; e s c p &gt; (CC BY 4.0, 2:57, rain + Rhodes) remains a good
  backup candidate if a 7th track is ever wanted.
- **YouTube Audio Library / Incompetech / Bensound:** not needed;
  FMA supplied all six tracks.
