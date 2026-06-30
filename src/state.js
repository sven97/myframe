import { loadSettings, saveSettings } from "./config.js";
import { buildIndex } from "./index-builder.js";
import { Selector } from "./selector.js";

export async function createState({ root, configDir }) {
  const settings = await loadSettings(configDir);
  const state = {
    root,
    configDir,
    settings,
    index: [],
    selector: new Selector(),
    async rescan() {
      this.index = await buildIndex({
        root: this.root,
        folders: this.settings.folders,
        recurse: this.settings.recurse,
        fileTypes: this.settings.fileTypes,
      });
      return this.index.length;
    },
    async update(partial) {
      this.settings = await saveSettings(this.configDir, { ...this.settings, ...partial });
      return this.rescan();
    },
  };
  await state.rescan();
  return state;
}
