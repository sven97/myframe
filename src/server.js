import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createState } from "./state.js";
import { listSubfolders } from "./browse.js";
import { renderImage } from "./image.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const MAX_DIM = 8000;

const VALID_ORIENTATIONS = ["vertical", "horizontal", "all"];

function parseDim(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(n, MAX_DIM);
}

export async function createApp({ root, configDir }) {
  const state = await createState({ root, configDir });
  const app = express();
  app.use(express.json());

  app.get("/api/status", (req, res) => {
    res.json({ count: state.index.length, settings: state.settings });
  });

  app.get("/api/settings", (req, res) => {
    res.json({ settings: state.settings });
  });

  app.put("/api/settings", async (req, res) => {
    const body = req.body ?? {};
    if (body.orientation && !VALID_ORIENTATIONS.includes(body.orientation)) {
      return res.status(400).json({ error: "invalid orientation" });
    }
    const count = await state.update(body);
    res.json({ settings: state.settings, count });
  });

  app.get("/api/folders", async (req, res) => {
    try {
      const folders = await listSubfolders(root, req.query.path ?? "");
      res.json({ folders });
    } catch {
      res.status(400).json({ error: "invalid path" });
    }
  });

  app.post("/api/rescan", async (req, res) => {
    const count = await state.rescan();
    res.json({ count });
  });

  async function servePhoto(req, res, width, height) {
    const orientation = VALID_ORIENTATIONS.includes(req.query.orientation)
      ? req.query.orientation
      : state.settings.orientation;
    const entry = state.selector.pick(state.index, orientation);
    if (!entry) return res.status(404).json({ error: "no matching photos" });
    try {
      const buf = await renderImage(entry.path, {
        width,
        height,
        format: state.settings.format,
        quality: state.settings.quality,
      });
      res.type(state.settings.format).send(buf);
    } catch {
      // corrupt file: drop it from the index and retry once
      state.index = state.index.filter((e) => e.path !== entry.path);
      const next = state.selector.pick(state.index, orientation);
      if (!next) return res.status(404).json({ error: "no matching photos" });
      const buf = await renderImage(next.path, {
        width,
        height,
        format: state.settings.format,
        quality: state.settings.quality,
      });
      res.type(state.settings.format).send(buf);
    }
  }

  app.get("/photo", (req, res) =>
    servePhoto(req, res, state.settings.defaultWidth, state.settings.defaultHeight)
  );

  app.get("/photo/:width/:height", (req, res) => {
    const width = parseDim(req.params.width);
    const height = parseDim(req.params.height);
    if (width === null || height === null) {
      return res.status(400).json({ error: "invalid dimensions" });
    }
    return servePhoto(req, res, width, height);
  });

  app.use(express.static(PUBLIC_DIR));

  return { app, state };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.env.PHOTO_ROOT ?? "/photos";
  const configDir = process.env.CONFIG_DIR ?? "/config";
  const port = Number(process.env.PORT ?? 8080);
  const { app, state } = await createApp({ root, configDir });
  // Periodic rescan so new photos on disk get picked up without a UI click.
  const intervalMin = Number(process.env.RESCAN_INTERVAL_MIN ?? 60);
  if (intervalMin > 0) {
    setInterval(() => {
      state.rescan().catch((e) => console.error("rescan failed", e));
    }, intervalMin * 60_000).unref();
  }
  app.listen(port, () => console.log(`MyFrame listening on :${port}`));
}
