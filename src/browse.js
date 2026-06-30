import { readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

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
    .filter((name) => !name.startsWith("@") && !name.startsWith("."))
    .sort();
}
