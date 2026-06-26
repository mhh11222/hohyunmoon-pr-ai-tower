import { describe, it, expect } from "vitest";
import { statSync, existsSync, readFileSync, openSync, readSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sizeKB = (p) => statSync(resolve(ROOT, p)).size / 1024;

// PNG IHDR color type lives at byte offset 25 (sig 8 + len 4 + "IHDR" 4 +
// width 4 + height 4 + bitDepth 1). Color types 4 (gray+alpha) and 6 (RGBA)
// carry an alpha channel. The portrait sampler masks pixels by alpha, so a
// flattened PNG (type 0/2) would silently break face masking — guard it here.
function pngColorType(p) {
  const fd = openSync(resolve(ROOT, p), "r");
  const buf = Buffer.alloc(26);
  readSync(fd, buf, 0, 26, 0);
  closeSync(fd);
  return buf[25];
}

describe("asset budget", () => {
  it("compressed audio exists and is under 5 MB", () => {
    expect(existsSync(resolve(ROOT, "assets/ambient.m4a"))).toBe(true);
    expect(sizeKB("assets/ambient.m4a")).toBeLessThan(5 * 1024);
  });

  it("the 20 MB mp3 is removed from the tree", () => {
    expect(existsSync(resolve(ROOT, "assets/ambient.mp3"))).toBe(false);
  });

  it("portrait png is under 800 KB", () => {
    expect(sizeKB("assets/portrait.png")).toBeLessThan(800);
  });

  it("portrait png keeps an alpha channel (face masking depends on it)", () => {
    expect([4, 6]).toContain(pngColorType("assets/portrait.png"));
  });

  it("audio.js points at the .m4a source", () => {
    const src = readFileSync(resolve(ROOT, "src/audio.js"), "utf8");
    expect(src).toMatch(/const SRC = "\.\/assets\/ambient\.m4a";/);
  });
});
