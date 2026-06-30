import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { orientationOf, buildIndex } from "../src/index-builder.js";
import { makeImage } from "./helpers/makeImage.js";

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "myframe-idx-"));
  return () => rm(root, { recursive: true, force: true });
});

describe("orientationOf", () => {
  it("classifies by dimensions", () => {
    expect(orientationOf(100, 200)).toBe("vertical");
    expect(orientationOf(200, 100)).toBe("horizontal");
    expect(orientationOf(100, 100)).toBe("square");
  });
});

describe("buildIndex", () => {
  it("indexes matching files with correct orientation, honoring fileTypes", async () => {
    await mkdir(join(root, "album"), { recursive: true });
    await writeFile(join(root, "album", "v.png"), await makeImage({ width: 100, height: 200 }));
    await writeFile(join(root, "album", "h.png"), await makeImage({ width: 200, height: 100 }));
    await writeFile(join(root, "album", "notes.txt"), "ignore me");

    const { entries } = await buildIndex({
      root, folders: ["album"], recurse: false, fileTypes: [".png"],
    });

    expect(entries).toHaveLength(2);
    const byName = Object.fromEntries(entries.map((e) => [e.path.split("/").pop(), e]));
    expect(byName["v.png"].orientation).toBe("vertical");
    expect(byName["h.png"].orientation).toBe("horizontal");
  });

  it("recurses into subfolders only when recurse=true", async () => {
    await mkdir(join(root, "a", "sub"), { recursive: true });
    await writeFile(join(root, "a", "top.png"), await makeImage({ width: 100, height: 100 }));
    await writeFile(join(root, "a", "sub", "deep.png"), await makeImage({ width: 100, height: 100 }));

    const flat = await buildIndex({ root, folders: ["a"], recurse: false, fileTypes: [".png"] });
    expect(flat.entries).toHaveLength(1);

    const deep = await buildIndex({ root, folders: ["a"], recurse: true, fileTypes: [".png"] });
    expect(deep.entries).toHaveLength(2);
  });

  it("skips Synology @eaDir and hidden subfolders when recursing", async () => {
    await mkdir(join(root, "a", "@eaDir"), { recursive: true });
    await mkdir(join(root, "a", ".hidden"), { recursive: true });
    await writeFile(join(root, "a", "real.png"), await makeImage({ width: 100, height: 100 }));
    await writeFile(
      join(root, "a", "@eaDir", "SYNOPHOTO_THUMB_XL.png"),
      await makeImage({ width: 40, height: 40 })
    );
    await writeFile(join(root, "a", ".hidden", "h.png"), await makeImage({ width: 40, height: 40 }));

    const { entries } = await buildIndex({ root, folders: ["a"], recurse: true, fileTypes: [".png"] });
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toMatch(/real\.png$/);
  });

  it("skips unreadable image files", async () => {
    await mkdir(join(root, "x"), { recursive: true });
    await writeFile(join(root, "x", "good.png"), await makeImage({ width: 100, height: 100 }));
    await writeFile(join(root, "x", "broken.png"), "not really a png");

    const { entries } = await buildIndex({ root, folders: ["x"], recurse: false, fileTypes: [".png"] });
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toMatch(/good\.png$/);
  });

  it("reports progress as processed/total", async () => {
    await mkdir(join(root, "p"), { recursive: true });
    for (let i = 0; i < 5; i++) {
      await writeFile(join(root, "p", `i${i}.png`), await makeImage({ width: 100, height: 100 }));
    }
    const calls = [];
    const { entries } = await buildIndex({
      root, folders: ["p"], recurse: false, fileTypes: [".png"],
      onProgress: (processed, total) => calls.push([processed, total]),
    });
    expect(entries).toHaveLength(5);
    // total is always 5; processed ends at 5
    expect(calls.every(([, total]) => total === 5)).toBe(true);
    expect(calls.at(-1)).toEqual([5, 5]);
    expect(calls).toHaveLength(5);
  });

  it("returns a cache and reuses it for unchanged files (no re-read)", async () => {
    await mkdir(join(root, "c"), { recursive: true });
    const p = join(root, "c", "a.png");
    await writeFile(p, await makeImage({ width: 120, height: 240 }));

    const first = await buildIndex({ root, folders: ["c"], recurse: false, fileTypes: [".png"] });
    expect(first.cache[p]).toBeDefined();
    expect(first.cache[p].width).toBe(120);

    // Tamper the cached dimensions to a sentinel. The file is untouched, so its
    // mtime+size still match the cache — a rebuild that REUSES the cache returns
    // the sentinel; a rebuild that re-reads the file would return 120x240.
    first.cache[p].width = 999;
    first.cache[p].height = 111;
    first.cache[p].orientation = "horizontal";

    const second = await buildIndex({
      root, folders: ["c"], recurse: false, fileTypes: [".png"], cache: first.cache,
    });
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].width).toBe(999); // proves the cache was used, not re-read
    expect(second.entries[0].orientation).toBe("horizontal");
  });

  it("re-reads a file whose mtime/size changed", async () => {
    await mkdir(join(root, "d"), { recursive: true });
    const p = join(root, "d", "a.png");
    await writeFile(p, await makeImage({ width: 100, height: 200 })); // vertical
    const first = await buildIndex({ root, folders: ["d"], recurse: false, fileTypes: [".png"] });
    expect(first.entries[0].orientation).toBe("vertical");

    // Replace with a horizontal image (different content → different size/mtime)
    await writeFile(p, await makeImage({ width: 300, height: 100 }));
    const second = await buildIndex({
      root, folders: ["d"], recurse: false, fileTypes: [".png"], cache: first.cache,
    });
    expect(second.entries[0].orientation).toBe("horizontal");
    expect(second.entries[0].width).toBe(300);
  });
});
