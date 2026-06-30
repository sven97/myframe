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

  it("applies EXIF orientation before cropping (pixel color check)", async () => {
    // Source: landscape 200×100, left half RED, right half GREEN, stored with EXIF
    // orientation 6 (90° CW correction needed).
    //
    // After .rotate() the image is portrait 100×200: TOP=RED, BOTTOM=GREEN
    // (original left→top, original right→bottom under 90° CW).
    // Rendered to 50×100 PNG with cover: rows 0-49=RED, rows 50-99=GREEN.
    //
    // Without .rotate() the source is treated as 200×100 landscape. Cover-cropping
    // to 50×100 pulls cols 75-124 of center → output cols 0-24=RED, cols 25-49=GREEN
    // (a left/right split, NOT a top/bottom split).
    //
    // Pixel (col=45, row=5):  RED with rotate, GREEN without → discriminating.
    // Pixel (col=5,  row=90): GREEN with rotate, RED without → discriminating.
    const leftBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const rightBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    const twoTone = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: leftBuf, left: 0, top: 0 },
        { input: rightBuf, left: 100, top: 0 },
      ])
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();

    const p = await write("twotone-rot.png", twoTone);
    // Use PNG output (lossless) to get precise pixel values.
    const out = await renderImage(p, { width: 50, height: 100, format: "png", quality: 80 });

    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    function getPixel(col, row) {
      const i = (row * info.width + col) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    }

    // Top-right area: should be RED after rotation. Without .rotate() this would be GREEN.
    const topRight = getPixel(45, 5);
    expect(topRight.r).toBeGreaterThan(200);
    expect(topRight.g).toBeLessThan(50);

    // Bottom-left area: should be GREEN after rotation. Without .rotate() this would be RED.
    const bottomLeft = getPixel(5, 90);
    expect(bottomLeft.g).toBeGreaterThan(200);
    expect(bottomLeft.r).toBeLessThan(50);
  });

  it("can output png", async () => {
    const p = await write("a.png", await makeImage({ width: 300, height: 300 }));
    const out = await renderImage(p, { width: 100, height: 100, format: "png", quality: 80 });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });
});
