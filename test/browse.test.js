import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSubfolders } from "../src/browse.js";

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "myframe-br-"));
  return () => rm(root, { recursive: true, force: true });
});

describe("listSubfolders", () => {
  it("lists immediate subfolders sorted, ignoring files", async () => {
    await mkdir(join(root, "beta"), { recursive: true });
    await mkdir(join(root, "alpha"), { recursive: true });
    await writeFile(join(root, "file.txt"), "x");
    expect(await listSubfolders(root)).toEqual(["alpha", "beta"]);
  });

  it("hides Synology metadata and hidden folders", async () => {
    await mkdir(join(root, "album"), { recursive: true });
    await mkdir(join(root, "@eaDir"), { recursive: true });
    await mkdir(join(root, ".hidden"), { recursive: true });
    expect(await listSubfolders(root)).toEqual(["album"]);
  });

  it("lists nested level when given a relative path", async () => {
    await mkdir(join(root, "a", "child"), { recursive: true });
    expect(await listSubfolders(root, "a")).toEqual(["child"]);
  });

  it("returns [] for a non-existent directory", async () => {
    expect(await listSubfolders(root, "nope")).toEqual([]);
  });

  it("rejects path traversal", async () => {
    await expect(listSubfolders(root, "../..")).rejects.toThrow("invalid path");
  });
});
