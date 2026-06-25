import { describe, it, expect } from "vitest";
import {
  luminance,
  tintByLuminance,
  chooseStride,
  pixelToWorld,
  samplePortrait,
  easeInOut,
  transitionPhases,
  PAL,
} from "../src/portrait.js";

describe("luminance", () => {
  it("maps black→0 and white→1", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5);
  });
  it("weights green more than blue (Rec.709)", () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });
});

describe("tintByLuminance", () => {
  it("mids land on signature aurora", () => {
    const c = tintByLuminance(0.5);
    expect(c[0]).toBeCloseTo(PAL.aurora[0], 5);
    expect(c[1]).toBeCloseTo(PAL.aurora[1], 5);
    expect(c[2]).toBeCloseTo(PAL.aurora[2], 5);
  });
  it("highlights trend toward bone (brighter than aurora overall)", () => {
    const hi = tintByLuminance(1);
    const sum = (c) => c[0] + c[1] + c[2];
    expect(sum(hi)).toBeGreaterThan(sum(PAL.aurora));
  });
  it("clamps out-of-range input", () => {
    expect(() => tintByLuminance(5)).not.toThrow();
    expect(() => tintByLuminance(-2)).not.toThrow();
  });
});

describe("chooseStride", () => {
  it("returns 1 when there are fewer opaque pixels than the target", () => {
    expect(chooseStride(1000, 7000)).toBe(1);
  });
  it("scales as sqrt(opaque/target)", () => {
    // 4x the pixels per particle → stride ~2
    expect(chooseStride(28000, 7000)).toBe(2);
    // 9x → stride ~3
    expect(chooseStride(63000, 7000)).toBe(3);
  });
  it("never goes below 1 and tolerates zero", () => {
    expect(chooseStride(0, 7000)).toBe(1);
    expect(chooseStride(100, 0)).toBe(1);
  });
});

describe("pixelToWorld", () => {
  it("centers the image and flips Y (top pixel → world up)", () => {
    const [, topY] = pixelToWorld(50, 0, 100, 200, { planeH: 2 });
    const [, botY] = pixelToWorld(50, 199, 100, 200, { planeH: 2 });
    expect(topY).toBeCloseTo(1, 4); // top of plane
    expect(botY).toBeCloseTo(-1, 4); // bottom of plane
  });
  it("preserves aspect on the X span", () => {
    const [leftX] = pixelToWorld(0, 100, 100, 200, { planeH: 2 });
    const [rightX] = pixelToWorld(99, 100, 100, 200, { planeH: 2 });
    // aspect 0.5 → planeW = 1 → x spans -0.5..0.5
    expect(leftX).toBeCloseTo(-0.5, 4);
    expect(rightX).toBeCloseTo(0.5, 4);
  });
  it("applies centerY offset", () => {
    const [, y] = pixelToWorld(0, 0, 10, 10, { planeH: 2, centerY: 5 });
    expect(y).toBeCloseTo(6, 4); // top (1) + center (5)
  });
});

// build a tiny synthetic RGBA buffer for samplePortrait
function makeImg(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = fn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

describe("samplePortrait", () => {
  it("keeps only pixels above the alpha threshold", () => {
    // left half opaque white, right half transparent
    const img = makeImg(20, 20, (x) => (x < 10 ? [255, 255, 255, 255] : [255, 255, 255, 0]));
    const out = samplePortrait(img, { targetCount: 400, alphaThreshold: 40, depthJitter: 0 });
    expect(out.count).toBeGreaterThan(0);
    // every kept particle's world X must be on the left half (<= ~0)
    for (let i = 0; i < out.count; i++) {
      expect(out.positions[i * 3]).toBeLessThanOrEqual(0.001);
    }
  });

  it("drops near-black pixels via the luma floor", () => {
    const img = makeImg(16, 16, () => [2, 2, 2, 255]); // opaque but near-black
    const out = samplePortrait(img, { targetCount: 200, lumaFloor: 0.06 });
    expect(out.count).toBe(0);
  });

  it("emits coherent typed arrays (n*3 positions/colors, n sizes/brights)", () => {
    const img = makeImg(40, 40, () => [180, 180, 180, 255]);
    const out = samplePortrait(img, { targetCount: 300, depthJitter: 0 });
    expect(out.positions.length).toBe(out.count * 3);
    expect(out.colors.length).toBe(out.count * 3);
    expect(out.sizes.length).toBe(out.count);
    expect(out.brights.length).toBe(out.count);
    expect(out.count).toBeGreaterThan(0);
  });

  it("downsamples large opaque images toward the target count (within ~2x)", () => {
    const img = makeImg(200, 200, () => [200, 200, 200, 255]); // 40k opaque
    const target = 4000;
    const out = samplePortrait(img, { targetCount: target, depthJitter: 0 });
    expect(out.count).toBeGreaterThan(target * 0.4);
    expect(out.count).toBeLessThan(target * 2.2);
  });

  it("is deterministic with an injected RNG", () => {
    const img = makeImg(30, 30, () => [150, 150, 150, 255]);
    const seed = () => 0.5;
    const a = samplePortrait(img, { targetCount: 200, rng: seed });
    const b = samplePortrait(img, { targetCount: 200, rng: seed });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});

describe("easeInOut", () => {
  it("hits endpoints and the midpoint", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });
  it("clamps out of range", () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });
});

describe("transitionPhases", () => {
  it("at p=0 the portrait is fully visible and the landscape is hidden", () => {
    const ph = transitionPhases(0);
    expect(ph.portrait).toBeCloseTo(1, 5);
    expect(ph.landscape).toBe(0);
    expect(ph.dolly).toBe(0);
    expect(ph.scatter).toBe(0);
  });
  it("at p=1 the portrait is gone and the landscape is fully revealed", () => {
    const ph = transitionPhases(1);
    expect(ph.portrait).toBe(0);
    expect(ph.landscape).toBeCloseTo(1, 5);
    expect(ph.dolly).toBeCloseTo(1, 5);
  });
  it("landscape stays hidden through the first third (no premature reveal)", () => {
    expect(transitionPhases(0.3).landscape).toBe(0);
    expect(transitionPhases(0.5).landscape).toBeGreaterThan(0);
  });
  it("scatter peaks mid-transition then is non-zero throughout the middle", () => {
    expect(transitionPhases(0.05).scatter).toBe(0);
    expect(transitionPhases(0.55).scatter).toBeGreaterThan(0.5);
  });
  it("all phase outputs stay within 0..1", () => {
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const ph = transitionPhases(p);
      for (const k of ["dolly", "scatter", "portrait", "landscape"]) {
        expect(ph[k]).toBeGreaterThanOrEqual(0);
        expect(ph[k]).toBeLessThanOrEqual(1);
      }
    }
  });
});
