import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createState } from "./state.js";
import { listSubfolders, safeResolve } from "./browse.js";
import { renderImage } from "./image.js";
import { DEFAULT_SETTINGS } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const MAX_DIM = 8000;

const VALID_ORIENTATIONS = ["vertical", "horizontal", "all"];
const VALID_FORMATS = ["jpeg", "png", "webp"];

function parseDim(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(n, MAX_DIM);
}

// Validates + normalizes a partial settings update. Throws Error("...") with a
// client-safe message on bad input; clamps oversized dimensions to MAX_DIM.
function normalizeSettings(partial, root) {
  const out = { ...partial };
  if ("orientation" in out && !VALID_ORIENTATIONS.includes(out.orientation)) {
    throw new Error("invalid orientation");
  }
  if ("format" in out && !VALID_FORMATS.includes(out.format)) {
    throw new Error("invalid format");
  }
  for (const key of ["defaultWidth", "defaultHeight"]) {
    if (key in out) {
      const n = parseDim(out[key]);
      if (n === null) throw new Error(`invalid ${key}`);
      out[key] = n;
    }
  }
  if ("quality" in out) {
    const q = Number(out.quality);
    if (!Number.isInteger(q) || q < 1 || q > 100) throw new Error("invalid quality");
    out.quality = q;
  }
  if ("recurse" in out && typeof out.recurse !== "boolean") {
    throw new Error("invalid recurse");
  }
  if ("fileTypes" in out) {
    if (!Array.isArray(out.fileTypes) || out.fileTypes.some((t) => typeof t !== "string")) {
      throw new Error("invalid fileTypes");
    }
  }
  if ("folders" in out) {
    if (!Array.isArray(out.folders) || out.folders.some((f) => typeof f !== "string")) {
      throw new Error("invalid folders");
    }
    for (const folder of out.folders) {
      try {
        safeResolve(root, folder); // reject folders escaping the photo root
      } catch {
        throw new Error("invalid path");
      }
    }
  }
  return out;
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
    let clean;
    try {
      clean = normalizeSettings(req.body ?? {}, root);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const count = await state.update(clean);
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
    try {
      // Try candidates until one renders; each unreadable file is pruned from
      // the index so the loop is bounded and a bad file never hangs the request.
      for (;;) {
        const entry = state.selector.pick(state.index, orientation);
        if (!entry) return res.status(404).json({ error: "no matching photos" });
        try {
          const buf = await renderImage(entry.path, {
            width,
            height,
            format: state.settings.format,
            quality: state.settings.quality,
          });
          return res.type(state.settings.format).send(buf);
        } catch {
          state.index = state.index.filter((e) => e.path !== entry.path);
        }
      }
    } catch {
      return res.status(500).json({ error: "render failed" });
    }
  }

  app.get("/photo", (req, res) => {
    // Defend against a hand-edited settings.json with bad default dimensions.
    const width = parseDim(state.settings.defaultWidth) ?? DEFAULT_SETTINGS.defaultWidth;
    const height = parseDim(state.settings.defaultHeight) ?? DEFAULT_SETTINGS.defaultHeight;
    return servePhoto(req, res, width, height);
  });

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
