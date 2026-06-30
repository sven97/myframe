import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";
import { safeResolve } from "./browse.js";

export function orientationOf(width, height) {
  if (height > width) return "vertical";
  if (width > height) return "horizontal";
  return "square";
}

async function walk(dir, recurse, exts, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory: skip
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      // Skip Synology metadata (@eaDir, @tmp) and hidden dirs (.DS_Store, etc.).
      // @eaDir holds SYNOPHOTO_THUMB_*.jpg thumbnails that must never be served.
      if (ent.name.startsWith("@") || ent.name.startsWith(".")) continue;
      if (recurse) await walk(full, recurse, exts, out);
    } else if (exts.has(extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
}

// Runs `fn` over `items` with at most `limit` in flight at once.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Builds the photo index for the selected folders.
 *
 * @param cache  Previous cache `{ [path]: {mtime,size,width,height,orientation} }`.
 *               Unchanged files (same mtime+size) reuse cached dimensions instead
 *               of re-reading the image header.
 * @param onProgress  Called as `(processed, total)` while scanning.
 * @param concurrency Max image-header reads in flight (default 12).
 * @returns `{ entries, cache }` — entries is `[{path,width,height,orientation}]`,
 *          cache is the refreshed cache to persist for next time.
 */
export async function buildIndex({
  root,
  folders,
  recurse,
  fileTypes,
  cache = {},
  onProgress,
  concurrency = 12,
}) {
  const exts = new Set(fileTypes.map((e) => e.toLowerCase()));
  const files = [];
  for (const folder of folders) {
    let dir;
    try {
      dir = safeResolve(root, folder); // skip folders that escape the root
    } catch {
      continue;
    }
    await walk(dir, recurse, exts, files);
  }

  const total = files.length;
  let processed = 0;
  const newCache = {};

  const results = await mapLimit(files, concurrency, async (path) => {
    try {
      const st = await stat(path);
      const cached = cache[path];
      let dims;
      if (cached && cached.mtime === st.mtimeMs && cached.size === st.size) {
        dims = {
          width: cached.width,
          height: cached.height,
          orientation: cached.orientation,
        };
      } else {
        const meta = await sharp(path).rotate().metadata();
        if (!meta.width || !meta.height) return null;
        dims = {
          width: meta.width,
          height: meta.height,
          orientation: orientationOf(meta.width, meta.height),
        };
      }
      newCache[path] = { mtime: st.mtimeMs, size: st.size, ...dims };
      return { path, ...dims };
    } catch {
      return null; // unreadable/corrupt image or vanished file: skip
    } finally {
      processed++;
      if (onProgress) onProgress(processed, total);
    }
  });

  return { entries: results.filter(Boolean), cache: newCache };
}
