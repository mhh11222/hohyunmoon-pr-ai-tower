import { describe, it, expect } from "vitest";
import {
  genomeToParticle,
  paretoFront,
  championOf,
  lerp,
  easeOut,
  lerpParticle,
} from "../src/ga.js";
import {
  fitnessAt,
  globalOptimum,
  objToWorld,
  sampleSurface,
  PEAKS,
} from "../src/landscape.js";
import evo from "../data/evo.js";

const gen = {
  generation: 3,
  genomes: [
    { id: "a", obj: [0.2, 0.9], fitness: 0.55, dominated: false },
    { id: "b", obj: [0.8, 0.3], fitness: 0.40, dominated: false },
    { id: "c", obj: [0.5, 0.5], fitness: 0.95, dominated: false }, // champion
    { id: "d", obj: [0.1, 0.1], fitness: 0.10, dominated: true },
  ],
};

describe("genomeToParticle", () => {
  it("maps obj→xy in [-1,1], fitness→z/size/brightness", () => {
    const p = genomeToParticle(gen.genomes[0]);
    expect(p.x).toBeCloseTo(0.2 * 2 - 1); // -0.6
    expect(p.y).toBeCloseTo(0.9 * 2 - 1); // 0.8
    expect(p.size).toBeGreaterThan(0);
    expect(p.brightness).toBeCloseTo(0.55, 5); // fitness
  });

  it("dominated genome is dimmer than non-dominated of equal fitness", () => {
    const lit = genomeToParticle({ obj: [0, 0], fitness: 0.5, dominated: false });
    const dim = genomeToParticle({ obj: [0, 0], fitness: 0.5, dominated: true });
    expect(dim.brightness).toBeLessThan(lit.brightness);
  });

  it("handles missing fitness gracefully (defaults to 0)", () => {
    const p = genomeToParticle({ obj: [0.5, 0.5], dominated: false });
    expect(p.brightness).toBe(0);
    expect(p.z).toBe(0);
    expect(p.size).toBeGreaterThan(0); // base size still present
  });
});

describe("paretoFront", () => {
  it("returns only non-dominated genomes, sorted by first objective", () => {
    const f = paretoFront(gen);
    expect(f.map((g) => g.id)).toEqual(["a", "c", "b"]); // obj[0]: .2 .5 .8
    expect(f.every((g) => !g.dominated)).toBe(true);
  });

  it("returns empty array when every genome is dominated", () => {
    const allDom = { genomes: [{ id: "x", obj: [0.1, 0.1], fitness: 0.1, dominated: true }] };
    expect(paretoFront(allDom)).toEqual([]);
  });
});

describe("championOf", () => {
  it("returns the max-fitness genome", () => {
    expect(championOf(gen).id).toBe("c");
  });

  it("returns null for an empty generation", () => {
    expect(championOf({ genomes: [] })).toBe(null);
  });
});

// --- P2: interpolation helpers (pure) ---
describe("lerp / easeOut", () => {
  it("lerp hits both endpoints and the midpoint", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(2, 6, 0.5)).toBe(4);
  });

  it("easeOut is clamped to 0..1 and monotonic", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-1)).toBe(0); // clamped low
    expect(easeOut(2)).toBe(1); // clamped high
    expect(easeOut(0.5)).toBeGreaterThan(0.5); // ease-OUT front-loads
  });
});

describe("lerpParticle", () => {
  const a = genomeToParticle({ obj: [0, 0], fitness: 0.2, dominated: false });
  const b = genomeToParticle({ obj: [1, 1], fitness: 0.8, dominated: false });

  it("returns the start particle at t=0", () => {
    const p = lerpParticle(a, b, 0);
    expect(p.x).toBeCloseTo(a.x);
    expect(p.brightness).toBeCloseTo(a.brightness);
  });

  it("returns the end particle at t=1", () => {
    const p = lerpParticle(a, b, 1);
    expect(p.x).toBeCloseTo(b.x);
    expect(p.size).toBeCloseTo(b.size);
  });

  it("interpolates x/y/z/size/brightness at the midpoint", () => {
    const p = lerpParticle(a, b, 0.5);
    expect(p.x).toBeCloseTo((a.x + b.x) / 2);
    expect(p.y).toBeCloseTo((a.y + b.y) / 2);
    expect(p.z).toBeCloseTo((a.z + b.z) / 2);
    expect(p.size).toBeCloseTo((a.size + b.size) / 2);
    expect(p.brightness).toBeCloseTo((a.brightness + b.brightness) / 2);
  });
});

// --- 3D fitness landscape (pure surface math) ---
describe("fitnessAt / landscape", () => {
  it("peaks higher than valleys (multi-modal surface)", () => {
    const peak = fitnessAt(PEAKS[0].cx, PEAKS[0].cy);
    const valley = fitnessAt(0.02, 0.02); // far corner from every peak
    expect(peak).toBeGreaterThan(valley);
    expect(valley).toBeLessThan(0.2);
  });

  it("the global optimum is the tallest peak, sampled at its own center", () => {
    const opt = globalOptimum();
    // it must out-rank every other peak's center
    for (const p of PEAKS) {
      expect(opt.z).toBeGreaterThanOrEqual(fitnessAt(p.cx, p.cy) - 1e-9);
    }
    // and be at PEAKS[0] (contract: index 0 is the global optimum)
    expect(opt.x).toBeCloseTo(PEAKS[0].cx);
    expect(opt.y).toBeCloseTo(PEAKS[0].cy);
    expect(opt.z).toBeGreaterThan(0.9); // normalized ~1 at the global peak
  });

  it("global optimum sits near where the final champion converges", () => {
    const opt = globalOptimum();
    const finalChamp = championOf(evo.generations[evo.generations.length - 1]);
    expect(Math.abs(opt.x - finalChamp.obj[0])).toBeLessThan(0.12);
    expect(Math.abs(opt.y - finalChamp.obj[1])).toBeLessThan(0.12);
  });

  it("objToWorld maps 0..1 → -1..1", () => {
    expect(objToWorld(0)).toBe(-1);
    expect(objToWorld(1)).toBe(1);
    expect(objToWorld(0.5)).toBe(0);
  });
});

describe("sampleSurface", () => {
  it("returns a coherent mesh: (subdiv+1)^2 verts, subdiv^2*6 indices", () => {
    const s = sampleSurface({ subdiv: 8 });
    const side = 9;
    expect(s.positions.length).toBe(side * side * 3);
    expect(s.heights.length).toBe(side * side);
    expect(s.indices.length).toBe(8 * 8 * 6);
  });

  it("XY positions span the centered [-1,1] world; Z follows fitness*zScale", () => {
    const zScale = 1.15;
    const s = sampleSurface({ subdiv: 16, zScale });
    const side = 17;
    // corner vertex (0,0) → world (-1,-1)
    expect(s.positions[0]).toBeCloseTo(-1);
    expect(s.positions[1]).toBeCloseTo(-1);
    // last vertex → world (1,1)
    const last = side * side - 1;
    expect(s.positions[last * 3]).toBeCloseTo(1);
    expect(s.positions[last * 3 + 1]).toBeCloseTo(1);
    // a vertex's Z equals its fitness * zScale
    const v = 100;
    expect(s.positions[v * 3 + 2]).toBeCloseTo(s.heights[v] * zScale);
  });

  it("indices reference only valid vertices", () => {
    const s = sampleSurface({ subdiv: 4 });
    const maxV = 5 * 5 - 1;
    for (const idx of s.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(maxV);
    }
  });
});

// --- P2: synthetic timeline shape ---
describe("evo timeline (synthetic multi-generation data)", () => {
  it("has a healthy number of generations (~14-18)", () => {
    expect(evo.generations.length).toBeGreaterThanOrEqual(14);
    expect(evo.generations.length).toBeLessThanOrEqual(18);
  });

  it("best fitness is non-decreasing and climbs ~0.55 → ~0.97", () => {
    const bests = evo.generations.map((g) => championOf(g).fitness);
    for (let i = 1; i < bests.length; i++) {
      expect(bests[i]).toBeGreaterThanOrEqual(bests[i - 1] - 1e-6);
    }
    expect(bests[0]).toBeLessThan(0.6);
    expect(bests[bests.length - 1]).toBeGreaterThan(0.9);
  });

  it("the champion changes a few times across the run (not every step)", () => {
    let prev = null;
    let changes = 0;
    for (const g of evo.generations) {
      const c = championOf(g);
      if (prev && (Math.abs(c.obj[0] - prev.obj[0]) > 0.01 || Math.abs(c.obj[1] - prev.obj[1]) > 0.01)) {
        changes++;
      }
      prev = c;
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(changes).toBeLessThanOrEqual(6);
  });

  it("every generation has a non-empty Pareto front and a constant population", () => {
    const pop = evo.generations[0].genomes.length;
    for (const g of evo.generations) {
      expect(g.genomes.length).toBe(pop);
      expect(paretoFront(g).length).toBeGreaterThanOrEqual(2);
    }
  });
});
