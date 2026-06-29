# MyFrame — Design

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation

## Purpose

A self-hosted app that serves random photos from local folders over a single, stable
HTTP URL — picsum-style. Built to feed a wall-mounted **e-ink digital photo frame** on
the LAN: the frame hits one URL and gets back one random photo, cropped to its exact
panel resolution, filtered by orientation.

Runs as a **single Docker container on a Synology NAS**. Reads photos directly from a
mounted folder (no Synology Photos API, no cloud, no auth). This works regardless of
whether the photos are managed by Synology Photos — it only needs files on disk.

### Why this exists

Synology Photos has shared-album pages and a sharing API, but **no built-in
random-single-image endpoint**. A dumb e-ink frame can only fetch a URL; it cannot call
an API, parse a JSON list, pick one, and resize it. MyFrame is exactly that glue.

## Non-goals (YAGNI)

- No cloud providers (iCloud / Google Photos / Synology sharing API). Folder-only.
- No live filesystem watching (too heavy on a NAS). Manual + periodic rescan instead.
- No auth / multi-user. LAN-only, single deployment.
- No `contain`/letterbox fit mode. Cropping (cover) only.
- No square-shortcut endpoint.

## Architecture

A **single Node.js container**. One language, one small image. `sharp` for imaging
(fast, ships prebuilt ARM + x86 binaries — matters for Synology hardware).

The Node service does three jobs:
1. Serves the **config web UI** (single-page frontend).
2. Exposes the **config/browse API** (list subfolders, read/write settings, rescan).
3. Exposes the **photo-serving API** (`/photo`) with on-the-fly crop/resize.

### Volume mounts (`docker-compose.yml`)

| Host | Container | Mode | Purpose |
|------|-----------|------|---------|
| `/volume1/photo` | `/photos` | `ro` | Photo root the UI browses |
| `./config` | `/config` | `rw` | Persisted settings JSON + index cache |

The container can only see what is mounted. The UI browses **subfolders inside the
mounted root**, not the whole NAS.

## Components

### 1. Photo index
On startup, on a **"Rescan" button**, and on a **periodic timer**, the app walks the
selected subfolders. For each image it records: path, dimensions, and EXIF-corrected
**orientation tag** (`vertical` / `horizontal` / `square`). The index is cached to
`/config` so restarts are fast. No live FS watching.

- Orientation derived from EXIF-corrected dimensions: `h > w` → vertical, `w > h` →
  horizontal, `w == h` → square.
- Only files matching the configured type filter are indexed.

### 2. Serving endpoint
- `GET /photo` → random image cropped to the **configured default W×H** (set to the
  e-ink panel resolution).
- `GET /photo/:width/:height` → random image cropped to exactly `width × height`.
- Honors the **orientation filter** (vertical / horizontal / all), with optional
  `?orientation=` per-request override.
- **Avoids repeating the immediately-previous served image.**
- Pipeline: read file → EXIF auto-rotate → **scale-to-cover + smart-crop** to the
  requested size (always exact output dimensions, no letterboxing) → re-encode to JPEG
  (default; format/quality configurable).
- If no images match the active filter, returns HTTP 404 with a clear message.

### 3. Config web UI
- **Folders**: browse the mounted root, checkbox subfolders to include, per-selection
  recurse toggle.
- **Filters**: file types (`.jpg/.jpeg/.png/.heic/.webp`), orientation
  (vertical / horizontal / all).
- **Output**: default W×H, output format, quality.
- **Controls**: "Rescan now" button, live indexed-photo count, and a live preview of the
  `/photo` URL.
- Settings persist to `/config/settings.json`.

## Data flow

```
e-ink frame ──GET /photo──> Node service
                               │
                               ├─ pick random path from in-memory index (filtered, no-repeat)
                               ├─ read file from /photos (ro)
                               ├─ sharp: auto-rotate → cover-resize+crop → encode JPEG
                               └─ stream image back
```

Config UI ──> read/write `/config/settings.json` ──> triggers index rebuild.

## Error handling

- No matching images for filter → 404 with explanation.
- Unreadable/corrupt image file → skip it, log, pick another (do not 500 the frame).
- Missing/empty mounted root → UI surfaces a clear "no photos found / check mount" state.
- Invalid size params (non-numeric, absurdly large) → 400; clamp max dimensions to a
  sane ceiling.

## Testing

Unit tests with a few committed fixture images:
- **Index builder**: orientation tagging from sample vertical/horizontal/square images.
- **Random selection**: respects orientation filter; avoids immediate repeat.
- **Crop pipeline**: output is exactly the requested dimensions; EXIF rotation applied;
  output format correct.

## Open items / future (not in scope now)

- Optional grayscale/dithering for e-ink (frames usually dither themselves).
- Additional photo sources (Immich random-asset API, Synology sharing API) as plugins.
- "Avoid last N" instead of just last-1 repeat avoidance.
