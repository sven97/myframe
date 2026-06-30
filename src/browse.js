import { readdir } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";

function isHidden(name) {
  return name.startsWith("@") || name.startsWith(".");
}

// Resolves `relative` against `root` and throws if the result escapes `root`.
// Shared guard used by folder listing, indexing, and settings validation.
export function safeResolve(root, relative = "") {
  const base = resolve(root);
  const target = resolve(base, relative);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("invalid path");
  }
  return target;
}

export async function listSubfolders(root, relative = "") {
  const target = safeResolve(root, relative);
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // Hide Synology metadata (@eaDir, @tmp) and hidden folders from the picker.
    .filter((name) => !isHidden(name))
    .sort();
}

// Like listSubfolders, but also returns a shallow image count per folder
// (files matching `fileTypes` directly inside — cheap, no image decoding).
export async function listFoldersWithCounts(root, relative = "", fileTypes = []) {
  const target = safeResolve(root, relative);
  const exts = new Set(fileTypes.map((e) => e.toLowerCase()));
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const dirs = entries
    .filter((e) => e.isDirectory() && !isHidden(e.name))
    .map((e) => e.name)
    .sort();

  const out = [];
  for (const name of dirs) {
    let count = 0;
    try {
      const inner = await readdir(join(target, name), { withFileTypes: true });
      count = inner.filter(
        (e) => e.isFile() && exts.has(extname(e.name).toLowerCase())
      ).length;
    } catch {
      count = 0;
    }
    out.push({ name, count });
  }
  return out;
}
