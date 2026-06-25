// PORTRAIT SAMPLING — pure math (no THREE, no DOM) so it unit-tests cleanly.
//
// The "face portal" (STATE A) renders the site owner as a glowing PARTICLE
// PORTRAIT made of the same aurora particles as the GA field. This module is
// the pure core: it turns an RGBA pixel buffer (sampled from assets/portrait.png
// onto a canvas by the caller) into flat typed arrays of particle attributes —
// world-plane positions, palette-tinted colors, and sizes — ready to drop into
// a THREE.BufferGeometry.
//
// Contract (testable without a browser):
//   samplePortrait({ width, height, data }, opts) →
//     { positions:Float32Array(n*3), colors:Float32Array(n*3),
//       sizes:Float32Array(n), brights:Float32Array(n), count:n }
//   where a pixel is KEPT iff alpha > alphaThreshold, downsampled by `stride`
//   toward ~targetCount, mapped pixel(px,py) → world plane [-aspectX..aspectX] ×
//   [planeTop..planeBottom], luminance → brightness/size, palette tint by
//   luminance (aurora cyan core → bone highlights, thermal low-light accents).

// ---- palette (linear-ish 0..1 RGB, matches DESIGN.md tokens) ----------------
export const PAL = {
  aurora: [0.369, 0.918, 1.0], // #5eeaff
  bone: [0.957, 0.953, 0.933], // #f4f3ee
  thermal: [1.0, 0.416, 0.239], // #ff6a3d
  dim: [0.165, 0.49, 0.549], // #2a7d8c aurora-dim
};

/** Perceptual luminance of an 8-bit RGB triple, normalized 0..1. Pure. */
export function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Palette tint for a portrait particle by its luminance (0..1).
 *   shadows  → aurora-dim, with a faint thermal warmth in the very darkest
 *   mids     → signature aurora cyan (the "core" of the figure)
 *   highlights→ bone (skin / lit edges read warm-white)
 * Returns [r,g,b] 0..1. Pure.
 * @param {number} l luminance 0..1
 * @param {[number,number,number]} [out]
 */
export function tintByLuminance(l, out = [0, 0, 0]) {
  const t = Math.min(1, Math.max(0, l));
  let a, b, f;
  if (t < 0.5) {
    // dim → aurora across the lower half (with a hint of thermal in the floor)
    a = PAL.dim;
    b = PAL.aurora;
    f = t / 0.5;
  } else {
    // aurora → bone across the upper half (highlights go bone-white)
    a = PAL.aurora;
    b = PAL.bone;
    f = (t - 0.5) / 0.5;
  }
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  // warm the very darkest pixels slightly toward thermal so shadow rim reads
  if (t < 0.18) {
    const w = (0.18 - t) / 0.18; // 0..1
    out[0] += (PAL.thermal[0] - out[0]) * w * 0.4;
    out[1] += (PAL.thermal[1] - out[1]) * w * 0.4;
    out[2] += (PAL.thermal[2] - out[2]) * w * 0.4;
  }
  return out;
}

/**
 * Choose a sampling stride that downsamples an opaque-pixel budget toward a
 * target particle count. Pure + deterministic.
 *   stride s keeps ~ opaquePixels / s^2 particles → s ≈ sqrt(opaque/target).
 * Clamped to >= 1. Used so the portrait lands near targetCount regardless of
 * image size or device budget.
 * @param {number} opaquePixels rough count of alpha>thr pixels
 * @param {number} targetCount desired particle count
 * @returns {number} integer stride >= 1
 */
export function chooseStride(opaquePixels, targetCount) {
  if (targetCount <= 0 || opaquePixels <= 0) return 1;
  const s = Math.sqrt(opaquePixels / targetCount);
  return Math.max(1, Math.round(s));
}

/**
 * Map a pixel coordinate to the portrait's world plane.
 *   px,py are pixel coords (origin top-left). The image is fit into a plane of
 *   height `planeH` centered vertically at `centerY`, preserving aspect; +Y is
 *   up in world space (so we flip py). Returns [wx, wy]. Pure.
 * @param {number} px 0..width
 * @param {number} py 0..height
 * @param {number} width image width px
 * @param {number} height image height px
 * @param {object} [opts]
 * @param {number} [opts.planeH=2.6] world height of the portrait plane
 * @param {number} [opts.centerY=0] world Y of the plane center
 */
export function pixelToWorld(px, py, width, height, opts = {}) {
  const { planeH = 2.6, centerY = 0 } = opts;
  const aspect = width / height;
  const planeW = planeH * aspect;
  // normalize 0..1 across the image
  const nx = px / (width - 1 || 1);
  const ny = py / (height - 1 || 1);
  const wx = (nx - 0.5) * planeW;
  const wy = (0.5 - ny) * planeH + centerY; // flip Y: image top → world up
  return [wx, wy];
}

/**
 * Sample an RGBA pixel buffer into portrait particle attributes. Pure: takes a
 * plain { width, height, data } (data = Uint8ClampedArray length width*height*4,
 * RGBA) and never touches THREE/DOM. The caller draws the PNG to a canvas and
 * passes ctx.getImageData(...) here.
 *
 * @param {{width:number,height:number,data:Uint8Array|Uint8ClampedArray|number[]}} img
 * @param {object} [opts]
 * @param {number} [opts.targetCount=7000] desired particle count
 * @param {number} [opts.alphaThreshold=40] keep pixels with alpha > this (0..255)
 * @param {number} [opts.lumaFloor=0.06] drop near-black kept pixels below this luma
 * @param {number} [opts.planeH=2.6] world height of the portrait plane
 * @param {number} [opts.centerY=0] world Y of the plane center
 * @param {number} [opts.depthJitter=0.05] random ± world Z so the cloud has volume
 * @param {() => number} [opts.rng=Math.random] injectable RNG (deterministic tests)
 * @returns {{positions:Float32Array,colors:Float32Array,sizes:Float32Array,brights:Float32Array,count:number,plane:{w:number,h:number}}}
 */
export function samplePortrait(img, opts = {}) {
  const {
    targetCount = 7000,
    alphaThreshold = 40,
    lumaFloor = 0.06,
    planeH = 2.6,
    centerY = 0,
    depthJitter = 0.05,
    rng = Math.random,
  } = opts;

  const { width, height, data } = img;

  // first pass: count opaque pixels to pick a stride that hits the budget
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > alphaThreshold) opaque++;
  }
  const stride = chooseStride(opaque, targetCount);

  // second pass: walk on the stride grid, keep opaque + above-luma-floor pixels
  const px = [];
  const cl = [];
  const sz = [];
  const br = [];
  const tmp = [0, 0, 0];
  const aspect = width / height;
  const planeW = planeH * aspect;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a <= alphaThreshold) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = luminance(r, g, b);
      if (l < lumaFloor) continue;

      const nx = x / (width - 1 || 1);
      const ny = y / (height - 1 || 1);
      const wx = (nx - 0.5) * planeW;
      const wy = (0.5 - ny) * planeH + centerY;
      const wz = (rng() - 0.5) * 2 * depthJitter;
      px.push(wx, wy, wz);

      tintByLuminance(l, tmp);
      cl.push(tmp[0], tmp[1], tmp[2]);

      // brighter, slightly larger dots where the image is luminous; alpha eases
      // the figure's soft edges so the silhouette doesn't read as a hard cutout.
      const aN = a / 255;
      sz.push(1.4 + l * 3.6);
      br.push(Math.max(0.06, l * aN));
    }
  }

  const count = sz.length;
  return {
    positions: Float32Array.from(px),
    colors: Float32Array.from(cl),
    sizes: Float32Array.from(sz),
    brights: Float32Array.from(br),
    count,
    plane: { w: planeW, h: planeH },
  };
}

// ---------------------------------------------------------------------------
// TRANSITION PROGRESS — the click "zoom-into-brain" beat is driven by a single
// 0..1 progress. These pure helpers shape that progress into the sub-curves the
// renderer consumes (camera dolly, particle scatter, portrait fade, landscape
// reveal) so the timing is testable without a GPU.
// ---------------------------------------------------------------------------

/** cubic ease-in-out. Pure, clamped. */
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Decompose overall transition progress p (0..1) into the named sub-curves of
 * the zoom-into-brain beat. Pure so the choreography is unit-tested.
 *   dolly      — camera pushes toward the head: eased 0→1 across the whole beat
 *   scatter    — portrait particles stream along depth: ramps in early, peaks mid
 *   portrait   — portrait opacity: holds, then fades out by ~70%
 *   landscape  — GA landscape opacity: stays hidden early, fades in from ~45%
 * All outputs are clamped 0..1.
 * @param {number} p overall progress 0..1
 */
export function transitionPhases(p) {
  const t = Math.min(1, Math.max(0, p));
  const dolly = easeInOut(t);
  // scatter: 0 until ~10%, peaks ~1 around 55%, eases back toward 0.85 at end
  const scatter = easeInOut(Math.min(1, Math.max(0, (t - 0.1) / 0.5)));
  // portrait fades from full to 0 between 35% and 75%
  const portrait = 1 - Math.min(1, Math.max(0, (t - 0.35) / 0.4));
  // landscape reveals from 45% to 100%
  const landscape = Math.min(1, Math.max(0, (t - 0.45) / 0.55));
  return { dolly, scatter, portrait, landscape };
}
