import { describe, it, expect } from "vitest";
import { pipLayout, DICE_SPOTS } from "../ui/tiletexture.js";
import { tileFace } from "../ui/tileface.js";

describe("3D 패 얼굴 좌표", () => {
  it("알갱이 개수는 숫자와 같다", () => {
    for (let r = 1; r <= 9; r++) {
      expect(pipLayout(tileFace(`p${r}`), 100, 138)).toHaveLength(r);
    }
  });

  it("패 안에 들어간다 (밖으로 삐져나오지 않는다)", () => {
    for (let r = 1; r <= 9; r++) {
      for (const spot of pipLayout(tileFace(`p${r}`), 100, 138)) {
        expect(spot.x - spot.size / 2).toBeGreaterThanOrEqual(0);
        expect(spot.x + spot.size / 2).toBeLessThanOrEqual(100);
        expect(spot.y - spot.size / 2).toBeGreaterThanOrEqual(0);
        expect(spot.y + spot.size / 2).toBeLessThanOrEqual(138);
      }
    }
  });

  it("가로로 가운데 정렬된다", () => {
    const spots = pipLayout(tileFace("p9"), 100, 138);
    const xs = spots.map((s) => s.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(50, 5);
  });

  it("1통은 큰 알갱이 하나", () => {
    const [spot] = pipLayout(tileFace("p1"), 100, 138);
    expect(spot.size).toBeGreaterThan(pipLayout(tileFace("p5"), 100, 138)[0].size);
  });

  it("빨간 막대 자리가 그대로 넘어온다", () => {
    expect(pipLayout(tileFace("s5"), 100, 138).some((s) => s.red)).toBe(true);
    expect(pipLayout(tileFace("s6"), 100, 138).some((s) => s.red)).toBe(false);
  });
});

describe("주사위 눈", () => {
  it("1~6 모두 눈 수가 맞다", () => {
    for (let v = 1; v <= 6; v++) expect(DICE_SPOTS[v]).toHaveLength(v);
  });

  it("눈은 면 안에 있다", () => {
    for (let v = 1; v <= 6; v++) {
      for (const [x, y] of DICE_SPOTS[v]) {
        expect(x).toBeGreaterThan(0.1);
        expect(x).toBeLessThan(0.9);
        expect(y).toBeGreaterThan(0.1);
        expect(y).toBeLessThan(0.9);
      }
    }
  });
});
