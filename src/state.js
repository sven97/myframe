import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadSettings, saveSettings } from "./config.js";
import { buildIndex } from "./index-builder.js";
import { Selector } from "./selector.js";

export async function createState({ root, configDir }) {
  const settings = await loadSettings(configDir);
  const cachePath = join(configDir, "index.json");

  const state = {
    root,
    configDir,
    settings,
    index: [],
    cache: {},
    selector: new Selector(),
    scanStatus: { running: false, processed: 0, total: 0 },
    _run: null,

    async _loadCache() {
      try {
        this.cache = JSON.parse(await readFile(cachePath, "utf8"));
      } catch {
        this.cache = {}; // missing or corrupt cache: start fresh
      }
    },

    async _saveCache() {
      try {
        await mkdir(configDir, { recursive: true });
        await writeFile(cachePath, JSON.stringify(this.cache), "utf8");
      } catch {
        // persisting the cache is an optimization; never fail a scan over it
      }
    },

    // Awaitable full rescan. Sets `running` true synchronously at its top so a
    // caller that fires it without awaiting can immediately observe progress.
    async rescan() {
      this.scanStatus = { running: true, processed: 0, total: 0 };
      try {
        const { entries, cache } = await buildIndex({
          root: this.root,
          folders: this.settings.folders,
          recurse: this.settings.recurse,
          fileTypes: this.settings.fileTypes,
          cache: this.cache,
          onProgress: (processed, total) => {
            this.scanStatus.processed = processed;
            this.scanStatus.total = total;
          },
        });
        this.index = entries;
        this.cache = cache;
        await this._saveCache();
        return entries.length;
      } finally {
        this.scanStatus.running = false;
      }
    },

    // Fire-and-forget rescan; no-op if one is already running. Returns a promise
    // (handy for tests) that resolves when the background scan finishes.
    startRescan() {
      if (this.scanStatus.running) return this._run;
      this._run = this.rescan().catch((err) => console.error("rescan failed", err));
      return this._run;
    },

    async update(partial) {
      this.settings = await saveSettings(this.configDir, { ...this.settings, ...partial });
      this.startRescan();
      return this.settings;
    },
  };

  await state._loadCache();
  await state.rescan();
  return state;
}
