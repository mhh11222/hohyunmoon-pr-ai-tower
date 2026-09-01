import { describe, it, expect } from "vitest";
import { angleAt, angleBetween, bodyFrame, toBody, elevation, yaw, jointAngles, compareAngles, describeTransition } from "../src/angles.js";
import { J } from "../src/skeleton.js";
import { sequence } from "../data/demo.js";

const lmOf = (id) => sequence.poses.find((p) => p.id === id).ref;

describe("angleAt", () => {
  it("직각·일직선·예각", () => {
    expect(angleAt([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90, 5);
    expect(angleAt([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 5);
    expect(angleAt([1, 0, 0], [0, 0, 0], [1, 1, 0])).toBeCloseTo(45, 5);
  });
  it("영벡터에도 NaN이 나오지 않는다", () => {
    expect(Number.isNaN(angleBetween([0, 0, 0], [1, 0, 0]))).toBe(false);
  });
});

describe("bodyFrame", () => {
  it("정면으로 선 데모 자세에서 왼쪽=+x, 위=+y, 앞=+z", () => {
    const f = bodyFrame(lmOf("p01"));
    expect(f.left[0]).toBeCloseTo(1, 3);
    expect(f.up[1]).toBeCloseTo(1, 3);
    expect(f.forward[2]).toBeCloseTo(1, 3);
    expect(f.torso).toBeCloseTo(0.48, 2);
  });
  it("몸을 90° 돌려도 몸 기준 좌표는 같다", () => {
    const lm = lmOf("p06");
    const rot = lm.map(([x, y, z]) => [z, y, -x]); // y축 기준 회전
    const a = toBody(lm[J.left_wrist], bodyFrame(lm));
    const b = toBody(rot[J.left_wrist], bodyFrame(rot));
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(a[2]).toBeCloseTo(b[2], 6);
  });
});

describe("elevation / yaw", () => {
  const f = bodyFrame(lmOf("p01"));
  it("위로 향한 벡터는 +90°, 앞은 0°", () => {
    expect(elevation([0, 1, 0], f)).toBeCloseTo(90, 5);
    expect(elevation([0, 0, 1], f)).toBeCloseTo(0, 5);
    expect(yaw([0, 0, 1], f)).toBeCloseTo(0, 5);
    expect(yaw([1, 0, 0], f)).toBeCloseTo(90, 5);
  });
});

describe("jointAngles", () => {
  it("모든 정의에 값이 있고 NaN이 없다", () => {
    const list = jointAngles(lmOf("p06"));
    expect(list.length).toBeGreaterThan(10);
    for (const a of list) expect(Number.isFinite(a.value)).toBe(true);
  });
  it("탄수는 팔꿈치가 예비세보다 훨씬 굽어 있다", () => {
    const rest = Object.fromEntries(jointAngles(lmOf("p01")).map((a) => [a.key, a.value]));
    const tan = Object.fromEntries(jointAngles(lmOf("p06")).map((a) => [a.key, a.value]));
    expect(rest.l_elbow).toBeGreaterThan(160);
    expect(tan.l_elbow).toBeLessThan(150);
    expect(Math.abs(tan.l_elbow_offset)).toBeLessThan(10); // 팔꿈치가 중심선 가까이
  });
  it("compareAngles는 같은 자세면 차이 0", () => {
    const a = jointAngles(lmOf("p06"));
    for (const d of compareAngles(a, a)) expect(d.delta).toBeCloseTo(0, 6);
  });
});

describe("describeTransition", () => {
  it("수권 → 좌 탄수는 왼팔꿈치 펴기가 먼저 나온다", () => {
    const steps = describeTransition(lmOf("p05"), lmOf("p06"));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => s.key === "l_elbow" && s.delta > 0)).toBe(true);
    expect(steps[0].text).toMatch(/→/);
    // 오른팔은 그대로이므로 오른팔꿈치는 목록에 없어야 한다
    expect(steps.some((s) => s.key === "r_elbow")).toBe(false);
  });
  it("같은 자세면 비어 있다", () => {
    expect(describeTransition(lmOf("p02"), lmOf("p02"))).toEqual([]);
  });
});
