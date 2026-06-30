import sharp from "sharp";

// Creates a solid-color raw image of given pixel dimensions, encoded as PNG.
// If `orientation` (1-8) is given, the EXIF orientation tag is embedded.
export async function makeImage({ width, height, orientation, color }) {
  const { r = 100, g = 150, b = 200 } = color ?? {};
  let img = sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  });
  if (orientation) img = img.withMetadata({ orientation });
  return img.png().toBuffer();
}
