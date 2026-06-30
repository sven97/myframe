# MyFrame

Serves random photos from local folders over a picsum-style URL for a LAN
e-ink photo frame. Runs as a single Docker container (built for Synology NAS,
works anywhere Docker does). Reads photos straight from a mounted folder — no
cloud, no Synology Photos API, no auth.

## Run (Synology / Docker)

1. Edit `docker-compose.yml` — point the first volume at your photo root
   (e.g. `/volume1/photo:/photos:ro`).
2. `docker compose up -d --build`
3. Open `http://<nas-ip>:8080`, pick folders, set orientation and your panel's
   default width/height, then **Save & rescan**.
4. Point the frame at `http://<nas-ip>:8080/photo`.

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

## Develop

```bash
npm install
npm test
PHOTO_ROOT=/path/to/photos CONFIG_DIR=./config npm start
```
