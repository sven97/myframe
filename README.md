# MyFrame

Serves random photos from local folders over a picsum-style URL for a LAN
e-ink photo frame. Runs as a single Docker container (built for Synology NAS,
works anywhere Docker does). Reads photos straight from a mounted folder — no
cloud, no Synology Photos API, no auth.

## Run (Synology / Docker)

A prebuilt multi-arch image (Intel + ARM) is published to GHCR by CI on every
push to `main`: `ghcr.io/sven97/myframe:latest`.

1. Grab `docker-compose.yml` and edit the first volume to point at your photo
   root (e.g. `/volume1/photo:/photos:ro`).
2. `docker compose up -d` (pulls the prebuilt image — no local build needed).
   To build from source on the NAS instead, swap the `image:` line for `build: .`.
3. Open `http://<nas-ip>:8080`, pick folders, set orientation and your panel's
   default width/height, then **Save & rescan**.
4. Point the frame at `http://<nas-ip>:8080/photo`.

Update later with `docker compose pull && docker compose up -d`.

## Endpoints

- `GET /photo` — random image cropped to the configured default size.
- `GET /photo/:width/:height` — random image cropped to exactly that size.
- `?orientation=vertical|horizontal|all` — override the configured filter.

Images are EXIF-auto-rotated, scaled to cover, and center-cropped to the exact
requested dimensions (no letterboxing). The immediately-previous image is never
served twice in a row.

## Configuration

Settings persist to `/config/settings.json`:

| Key | Meaning |
|-----|---------|
| `folders` | Subfolders of the photo root to serve from |
| `recurse` | Descend into subfolders |
| `fileTypes` | Extensions to index |
| `orientation` | `vertical` / `horizontal` / `all` |
| `defaultWidth`, `defaultHeight` | Size for bare `/photo` (set to your panel) |
| `format`, `quality` | Output encoding (`jpeg` default) |

`RESCAN_INTERVAL_MIN` (env, default 60) controls how often the index refreshes
to pick up new files; set `0` to disable the timer and rescan only via the UI.

### HEIC / HEIF photos

`.heic` is listed in the defaults, but `sharp`'s stock prebuilt libvips (used by
the `node:22-bookworm-slim` base image) ships **without** a HEIF decoder, so
HEIC files are silently skipped during indexing. iPhone photos are commonly
HEIC — if your library is mostly HEIC, you'll need a libvips build with HEIF
support (or convert to JPEG). Track this as a follow-up if you hit it.

## Develop

```bash
npm install
npm test
PHOTO_ROOT=/path/to/photos CONFIG_DIR=./config npm start
```
