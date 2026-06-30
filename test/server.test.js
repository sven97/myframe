import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/server.js";
import { makeImage } from "./helpers/makeImage.js";

let root, configDir, app;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "myframe-srv-root-"));
  configDir = await mkdtemp(join(tmpdir(), "myframe-srv-cfg-"));
  await mkdir(join(root, "album"), { recursive: true });
  await writeFile(join(root, "album", "v.png"), await makeImage({ width: 100, height: 200 }));
  await writeFile(join(root, "album", "h.png"), await makeImage({ width: 200, height: 100 }));
  ({ app } = await createApp({ root, configDir }));
  return async () => {
    await rm(root, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  };
});

function parseImage(r, cb) {
  const chunks = [];
  r.on("data", (c) => chunks.push(c));
  r.on("end", () => cb(null, Buffer.concat(chunks)));
}

describe("server", () => {
  it("lists subfolders", async () => {
    const res = await request(app).get("/api/folders");
    expect(res.status).toBe(200);
    expect(res.body.folders).toEqual(["album"]);
  });

  it("saves settings and reports indexed count", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ folders: ["album"], orientation: "all" });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("404 when no images are indexed yet", async () => {
    const res = await request(app).get("/photo");
    expect(res.status).toBe(404);
  });

  it("serves a photo cropped to default size after configuring folders", async () => {
    await request(app).put("/api/settings").send({
      folders: ["album"], orientation: "all", defaultWidth: 120, defaultHeight: 160,
    });
    const res = await request(app).get("/photo").buffer(true).parse(parseImage);
    expect(res.status).toBe(200);
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(160);
  });

  it("serves an explicit size and honors orientation override", async () => {
    await request(app).put("/api/settings").send({ folders: ["album"], orientation: "all" });
    const res = await request(app).get("/photo/80/80?orientation=horizontal")
      .buffer(true).parse(parseImage);
    expect(res.status).toBe(200);
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(80);
  });

  it("400 on bad dimensions", async () => {
    await request(app).put("/api/settings").send({ folders: ["album"] });
    const res = await request(app).get("/photo/abc/100");
    expect(res.status).toBe(400);
  });
});
