import { describe, it, expect } from "vitest";
import { APP_NAME, VERSION } from "../src/version.js";

describe("scaffolding", () => {
  it("exposes app name and version", () => {
    expect(APP_NAME).toBe("MyFrame");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
