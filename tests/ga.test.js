import { describe, it, expect } from "vitest";
import { genomeToParticle, paretoFront, championOf } from "../src/ga.js";

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
