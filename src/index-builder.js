import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";

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
      if (recurse) await walk(full, recurse, exts, out);
    } else if (exts.has(extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
}

export async function buildIndex({ root, folders, recurse, fileTypes }) {
  const exts = new Set(fileTypes.map((e) => e.toLowerCase()));
  const files = [];
  for (const folder of folders) {
    await walk(join(root, folder), recurse, exts, files);
  }

  const entries = [];
  for (const path of files) {
    try {
      const meta = await sharp(path).rotate().metadata();
      if (!meta.width || !meta.height) continue;
      entries.push({
        path,
        width: meta.width,
        height: meta.height,
        orientation: orientationOf(meta.width, meta.height),
      });
    } catch {
      // unreadable/corrupt image: skip
    }
  }
  return entries;
}
