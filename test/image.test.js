import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { renderImage } from "../src/image.js";
import { makeImage } from "./helpers/makeImage.js";

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "myframe-img-"));
  return () => rm(dir, { recursive: true, force: true });
});

async function write(name, buf) {
  const p = join(dir, name);
  await writeFile(p, buf);
  return p;
}

describe("renderImage", () => {
  it("outputs exactly the requested dimensions (cover crop)", async () => {
    const p = await write("wide.png", await makeImage({ width: 400, height: 100 }));
    const out = await renderImage(p, { width: 200, height: 200, format: "jpeg", quality: 80 });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
    expect(meta.format).toBe("jpeg");
  });

  it("applies EXIF orientation before cropping", async () => {
    // Stored 200x100 but orientation 6 means display is 100x200 (rotated 90deg).
    const p = await write("rot.png", await makeImage({ width: 200, height: 100, orientation: 6 }));
    const out = await renderImage(p, { width: 50, height: 100, format: "jpeg", quality: 80 });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(100);
  });

  it("can output png", async () => {
    const p = await write("a.png", await makeImage({ width: 300, height: 300 }));
    const out = await renderImage(p, { width: 100, height: 100, format: "png", quality: 80 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
  });
});
