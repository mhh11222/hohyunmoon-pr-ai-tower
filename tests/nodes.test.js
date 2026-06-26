import { describe, it, expect } from "vitest";
import { projectToObjective, nodePlacements } from "../src/nodes.js";
import { fitnessAt, objToWorld, Z_SCALE } from "../src/landscape.js";

describe("projectToObjective", () => {
  it("is deterministic and inset within 0.1..0.9 on both axes", () => {
    const a = projectToObjective({ name: "velvoid-mentor" });
    const b = projectToObjective({ name: "velvoid-mentor" });
    expect(a).toEqual(b);
    for (const v of [a.x, a.y]) {
      expect(v).toBeGreaterThanOrEqual(0.1);
      expect(v).toBeLessThanOrEqual(0.9);
    }
  });
  it("spreads different names to different spots", () => {
    expect(projectToObjective({ name: "alpha" })).not.toEqual(
      projectToObjective({ name: "beta" }),
    );
  });
});

describe("nodePlacements", () => {
  it("places each node above the surface in the real Z-up frame", () => {
    const projects = [{ name: "alpha" }, { name: "beta" }];
    const out = nodePlacements(projects);
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.project).toBeDefined();
      // world frame: X/Y from objToWorld, +Z is up (height)
      expect(p.world.x).toBeCloseTo(objToWorld(p.obj.x), 6);
      expect(p.world.y).toBeCloseTo(objToWorld(p.obj.y), 6);
      const surface = fitnessAt(p.obj.x, p.obj.y) * Z_SCALE;
      // node floats strictly above the surface height on the Z (up) axis
      expect(p.world.z).toBeGreaterThan(surface);
    }
  });
  it("is deterministic", () => {
    const a = nodePlacements([{ name: "alpha" }]);
    const b = nodePlacements([{ name: "alpha" }]);
    expect(a[0].world).toEqual(b[0].world);
  });
  it("returns [] for empty/missing input", () => {
    expect(nodePlacements([])).toEqual([]);
    expect(nodePlacements()).toEqual([]);
  });
});
