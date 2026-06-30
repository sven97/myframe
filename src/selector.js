export class Selector {
  constructor() {
    this.lastPath = null;
  }

  pick(entries, orientation) {
    let candidates =
      orientation === "all"
        ? entries
        : entries.filter((e) => e.orientation === orientation);

    if (candidates.length === 0) return null;

    if (candidates.length > 1 && this.lastPath) {
      const filtered = candidates.filter((e) => e.path !== this.lastPath);
      if (filtered.length > 0) candidates = filtered;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastPath = chosen.path;
    return chosen;
  }
}
