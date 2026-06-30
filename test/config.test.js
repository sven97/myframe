import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/config.js";

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "myframe-cfg-"));
  return () => rm(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("returns defaults when no file exists", async () => {
    const s = await loadSettings(dir);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.orientation).toBe("all");
  });

  it("persists and reloads settings, merging missing keys from defaults", async () => {
    await saveSettings(dir, { folders: ["a"], defaultWidth: 800 });
    const s = await loadSettings(dir);
    expect(s.folders).toEqual(["a"]);
    expect(s.defaultWidth).toBe(800);
    // unspecified key falls back to default
    expect(s.format).toBe(DEFAULT_SETTINGS.format);
  });

  it("returns defaults when settings.json contains invalid JSON", async () => {
    const settingsFile = join(dir, "settings.json");
    await writeFile(settingsFile, "{ not valid json", "utf8");
    const s = await loadSettings(dir);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.orientation).toBe("all");
  });
});
