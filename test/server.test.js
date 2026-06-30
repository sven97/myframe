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

// Waits for the background rescan to finish.
async function waitScan() {
  for (let i = 0; i < 400; i++) {
    const r = await request(app).get("/api/rescan/status");
    if (!r.body.running) return r.body;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error("scan did not finish");
}

async function configure(body) {
  await request(app).put("/api/settings").send(body);
  await waitScan();
}

describe("server", () => {
  it("lists subfolders with image counts", async () => {
    const res = await request(app).get("/api/folders");
    expect(res.status).toBe(200);
    expect(res.body.folders).toEqual([{ name: "album", count: 2 }]);
  });

  it("PUT settings returns the saved settings and triggers a rescan", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ folders: ["album"], orientation: "all" });
    expect(res.status).toBe(200);
    expect(res.body.settings.folders).toEqual(["album"]);
    await waitScan();
    const status = await request(app).get("/api/status");
    expect(status.body.count).toBe(2);
  });

  it("404 when no images are indexed yet", async () => {
    const res = await request(app).get("/photo");
    expect(res.status).toBe(404);
  });

  it("serves a photo cropped to default size after configuring folders", async () => {
    await configure({ folders: ["album"], orientation: "all", defaultWidth: 120, defaultHeight: 160 });
    const res = await request(app).get("/photo").buffer(true).parse(parseImage);
    expect(res.status).toBe(200);
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(160);
  });

  it("serves an explicit size and honors orientation override", async () => {
    await configure({ folders: ["album"], orientation: "all" });
    const res = await request(app).get("/photo/80/80?orientation=horizontal")
      .buffer(true).parse(parseImage);
    expect(res.status).toBe(200);
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(80);
  });

  it("400 on bad dimensions", async () => {
    await configure({ folders: ["album"] });
    const res = await request(app).get("/photo/abc/100");
    expect(res.status).toBe(400);
  });

  it("returns 404 (does not hang) when every indexed file is unreadable", async () => {
    await configure({ folders: ["album"], orientation: "all" });
    await writeFile(join(root, "album", "v.png"), "garbage");
    await writeFile(join(root, "album", "h.png"), "garbage");
    const res = await request(app).get("/photo");
    expect(res.status).toBe(404);
  });

  it("clamps an oversized default dimension on save", async () => {
    const res = await request(app)
      .put("/api/settings")
      .send({ folders: ["album"], defaultWidth: 999999, defaultHeight: 500 });
    expect(res.status).toBe(200);
    expect(res.body.settings.defaultWidth).toBe(8000);
    await waitScan();
  });

  it("400 on non-positive default dimension", async () => {
    const res = await request(app).put("/api/settings").send({ defaultWidth: 0 });
    expect(res.status).toBe(400);
  });

  it("400 on out-of-range quality", async () => {
    const res = await request(app).put("/api/settings").send({ quality: 200 });
    expect(res.status).toBe(400);
  });

  it("rejects folders that escape the photo root", async () => {
    const res = await request(app).put("/api/settings").send({ folders: ["../../etc"] });
    expect(res.status).toBe(400);
  });

  it("rescan endpoint starts a scan and status reports completion", async () => {
    await configure({ folders: ["album"], orientation: "all" });
    const res = await request(app).post("/api/rescan");
    expect(res.status).toBe(200);
    expect(res.body.started).toBe(true);
    const status = await waitScan();
    expect(status.running).toBe(false);
    expect(status).toHaveProperty("processed");
    expect(status).toHaveProperty("total");
  });
});
