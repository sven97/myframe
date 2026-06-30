import { readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

export async function listSubfolders(root, relative = "") {
  const base = resolve(root);
  const target = resolve(base, relative);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error("invalid path");
  }
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
    .sort();
}
