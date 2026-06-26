// FITNESS LANDSCAPE — pure math (no THREE, no DOM) so it unit-tests cleanly.
//
// The hero is a 3D fitness landscape: a surface z = f(x,y) over the unit
// objective square (x,y ∈ [0,1], matching genome.obj). f is multi-modal — a
// sum of gaussian peaks — so the population has a non-trivial surface to climb,
// exactly like the reference image (several hills, one tallest global optimum).
//
// The GLOBAL OPTIMUM peak is placed where the synthetic timeline's final
// champion converges (~obj[0.28, 0.86]) so the climbing population ends up
// gathered right under the red × marker.

/**
 * Gaussian peaks defining the landscape. Each: center (cx,cy), height (h),
 * and width (w, std-dev-ish in objective-space units). The first peak is the
 * GLOBAL optimum (tallest) — its center is the home of the red × champion.
 *
 * Ordering: PEAKS[0] is the global optimum by contract (tallest height).
 */
export const PEAKS = [
  { cx: 0.28, cy: 0.86, h: 1.0, w: 0.15 }, // GLOBAL optimum (champion home)
  { cx: 0.64, cy: 0.4, h: 0.66, w: 0.18 }, // secondary ridge/hill
  { cx: 0.82, cy: 0.78, h: 0.5, w: 0.13 }, // minor peak (multi-modal texture)
];

/**
 * Fitness height at objective-space (x,y), both in [0,1]. Returns a scalar in
 * roughly [0, ~1] (the global peak normalizes to ~1 at its center). Pure.
 * @param {number} x 0..1
 * @param {number} y 0..1
 * @returns {number} surface height (fitness)
 */
export function fitnessAt(x, y) {
  let z = 0;
  for (const p of PEAKS) {
    const dx = x - p.cx;
    const dy = y - p.cy;
    const r2 = (dx * dx + dy * dy) / (p.w * p.w);
    z += p.h * Math.exp(-r2);
  }
  return z;
}

/**
 * The global optimum: center of the tallest peak. This is where the red ×
 * floats and where the population converges. Pure.
 * @returns {{x:number,y:number,z:number}}
 */
export function globalOptimum() {
  let best = PEAKS[0];
  for (const p of PEAKS) if (p.h > best.h) best = p;
  return { x: best.cx, y: best.cy, z: fitnessAt(best.cx, best.cy) };
}

/**
 * Map an objective coordinate (0..1) to centered world space (-1..1), matching
 * genomeToParticle's x/y convention. Pure helper shared by the surface + the
 * particle placement so they sit in the same frame.
 * @param {number} o 0..1
 */
export function objToWorld(o) {
  return o * 2 - 1;
}

// World height of a fitness=1 peak. Single source of truth for the surface
// frame; field.js re-exports it and node placement (nodes.js) imports it here
// (keeping nodes.js free of the THREE import chain so it stays unit-testable).
export const Z_SCALE = 1.45;

/**
 * Sample the surface on a SUBDIV×SUBDIV grid. Returns flat typed arrays ready
 * for a THREE.BufferGeometry: centered XY world positions in [-1,1], height in
 * Z (scaled by zScale), plus the raw 0..1 fitness per vertex (for coloring).
 *
 * Returned: { positions:Float32Array(n*3), heights:Float32Array(n),
 *             indices:Uint32Array, subdiv:number }
 * where n = (subdiv+1)^2.
 *
 * Pure: no THREE. The caller wraps positions/indices in a BufferGeometry.
 * @param {object} [opts]
 * @param {number} [opts.subdiv=128] cells per side (vertices = subdiv+1)
 * @param {number} [opts.zScale=1.15] world height of a fitness=1 peak
 */
export function sampleSurface({ subdiv = 128, zScale = 1.15 } = {}) {
  const side = subdiv + 1;
  const n = side * side;
  const positions = new Float32Array(n * 3);
  const heights = new Float32Array(n);

  let v = 0;
  for (let j = 0; j < side; j++) {
    const oy = j / subdiv; // 0..1 objective y
    for (let i = 0; i < side; i++) {
      const ox = i / subdiv; // 0..1 objective x
      const h = fitnessAt(ox, oy); // 0..~1 fitness
      positions[v * 3] = objToWorld(ox);
      positions[v * 3 + 1] = objToWorld(oy);
      positions[v * 3 + 2] = h * zScale;
      heights[v] = h;
      v++;
    }
  }

  // two triangles per cell
  const indices = new Uint32Array(subdiv * subdiv * 6);
  let t = 0;
  for (let j = 0; j < subdiv; j++) {
    for (let i = 0; i < subdiv; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[t++] = a;
      indices[t++] = c;
      indices[t++] = b;
      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = d;
    }
  }

  return { positions, heights, indices, subdiv };
}
