import sharp from "sharp";

export async function renderImage(filePath, { width, height, format, quality }) {
  let pipeline = sharp(filePath, { failOn: "error" })
    .rotate() // auto-rotate using EXIF orientation
    .resize(width, height, { fit: "cover", position: "centre" });

  if (format === "png") pipeline = pipeline.png();
  else if (format === "webp") pipeline = pipeline.webp({ quality });
  else pipeline = pipeline.jpeg({ quality });

  return pipeline.toBuffer();
}
