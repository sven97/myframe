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

    const entries = await buildIndex({
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
    expect(flat).toHaveLength(1);

    const deep = await buildIndex({ root, folders: ["a"], recurse: true, fileTypes: [".png"] });
    expect(deep).toHaveLength(2);
  });

  it("skips unreadable image files", async () => {
    await mkdir(join(root, "x"), { recursive: true });
    await writeFile(join(root, "x", "good.png"), await makeImage({ width: 100, height: 100 }));
    await writeFile(join(root, "x", "broken.png"), "not really a png");

    const entries = await buildIndex({ root, folders: ["x"], recurse: false, fileTypes: [".png"] });
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toMatch(/good\.png$/);
  });
});
