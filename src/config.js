import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_SETTINGS = {
  folders: [],
  recurse: true,
  fileTypes: [".jpg", ".jpeg", ".png", ".heic", ".webp"],
  orientation: "all",
  defaultWidth: 1200,
  defaultHeight: 1600,
  format: "jpeg",
  quality: 85,
};

function settingsPath(configDir) {
  return join(configDir, "settings.json");
}

export async function loadSettings(configDir) {
  try {
    const raw = await readFile(settingsPath(configDir), "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === "ENOENT") return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

export async function saveSettings(configDir, settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await mkdir(configDir, { recursive: true });
  await writeFile(settingsPath(configDir), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
