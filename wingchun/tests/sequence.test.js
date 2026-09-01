import { describe, it, expect } from "vitest";
import {
  frameAt, frameIndexAt, duration, segmentHolds, poseIndexAt, transitionOf, normalizePose, poseDistance,
  alignToPose, assignRefsToHolds, validateSequence, autoPoses,
} from "../src/sequence.js";
import { J } from "../src/skeleton.js";
import { sequence } from "../data/demo.js";

describe("데모 데이터", () => {
  it("무결성 검사를 통과한다", () => {
    expect(validateSequence(sequence)).toEqual([]);
    expect(sequence.poses.length).toBeGreaterThan(5);
  });
});

describe("frameAt", () => {
  it("프레임 사이를 선형 보간한다", () => {
    const f = sequence.frames;
    const a = f[10], b = f[11];
    const mid = frameAt(sequence, (a.t + b.t) / 2);
    for (let j = 0; j < 33; j++) for (let k = 0; k < 3; k++) expect(mid[j][k]).toBeCloseTo((a.lm[j][k] + b.lm[j][k]) / 2, 9);
  });
  it("범위 밖은 양 끝 프레임", () => {
    expect(frameAt(sequence, -5)).toEqual(sequence.frames[0].lm);
    expect(frameAt(sequence, 999)).toEqual(sequence.frames.at(-1).lm);
    expect(frameIndexAt(sequence.frames, duration(sequence))).toBe(sequence.frames.length - 1);
  });
});

describe("segmentHolds", () => {
  it("데모의 정지 구간 수 = 자세 수, 대표 시각은 자세 구간 안", () => {
    const holds = segmentHolds(sequence.frames);
    expect(holds.length).toBe(sequence.poses.length);
    holds.forEach((h, i) => {
      const p = sequence.poses[i];
      expect(h.key).toBeGreaterThanOrEqual(p.start - 0.15);
      expect(h.key).toBeLessThanOrEqual(p.end + 0.15);
    });
  });
  it("계속 움직이는 시퀀스에서는 아무것도 찾지 않는다", () => {
    const frames = [];
    for (let i = 0; i < 60; i++) {
      const lm = sequence.frames[0].lm.map(([x, y, z]) => [x + i * 0.05, y, z]);
      frames.push({ t: i / 15, lm });
    }
    expect(segmentHolds(frames)).toEqual([]);
  });
});

describe("poseIndexAt / transitionOf", () => {
  it("자세 구간 안이면 그 자세, 전환 중이면 앞 자세", () => {
    const p = sequence.poses[3];
    expect(poseIndexAt(sequence, p.key)).toBe(3);
    expect(poseIndexAt(sequence, p.end + 0.2)).toBe(3);
    const tr = transitionOf(sequence, 3);
    expect(tr.start).toBe(p.key);
    expect(tr.end).toBe(sequence.poses[4].key);
    expect(transitionOf(sequence, sequence.poses.length - 1)).toBeNull();
  });
});

describe("normalizePose / poseDistance / alignToPose", () => {
  const lm = sequence.poses[5].ref;
  const moved = lm.map(([x, y, z]) => [x * 1.3 + 0.5, y * 1.3 - 0.2, z * 1.3 + 2]); // 키 다르고 위치 다름
  const turned = lm.map(([x, y, z]) => [z, y, -x]); // 옆으로 서 있음
  it("크기·위치·방향이 달라도 같은 자세는 거리 0", () => {
    expect(poseDistance(lm, moved)).toBeLessThan(1e-6);
    expect(poseDistance(lm, turned)).toBeLessThan(1e-6);
  });
  it("다른 자세는 거리가 확실히 크다", () => {
    expect(poseDistance(sequence.poses[0].ref, sequence.poses[5].ref)).toBeGreaterThan(0.1);
  });
  it("alignToPose는 기준 자세를 현재 몸 위로 옮긴다", () => {
    const aligned = alignToPose(lm, moved);
    // 골반 중심이 현재 자세(moved)의 골반 중심과 같다
    const hip = (a) => [(a[J.left_hip][0] + a[J.right_hip][0]) / 2, (a[J.left_hip][1] + a[J.right_hip][1]) / 2];
    expect(hip(aligned)[0]).toBeCloseTo(hip(moved)[0], 6);
    expect(hip(aligned)[1]).toBeCloseTo(hip(moved)[1], 6);
    // 손목도 스케일에 맞게 옮겨졌다
    expect(aligned[J.left_wrist][0]).toBeCloseTo(moved[J.left_wrist][0], 6);
  });
});

describe("assignRefsToHolds", () => {
  const holds = sequence.poses.map((p) => p.ref);
  it("책 사진이 자세 순서대로면 각각 제 구간에 붙는다", () => {
    const refs = [sequence.poses[1].ref, sequence.poses[5].ref, sequence.poses[9].ref];
    expect(assignRefsToHolds(refs, holds)).toEqual([1, 5, 9]);
  });
  it("순서를 지키는 배정을 한다 (같은 구간을 두 사진이 차지하지 않음)", () => {
    const refs = [sequence.poses[6].ref, sequence.poses[6].ref];
    const out = assignRefsToHolds(refs, holds);
    expect(out[0]).toBeLessThan(out[1]);
  });
  it("빈 입력", () => {
    expect(assignRefsToHolds([], holds)).toEqual([]);
    expect(assignRefsToHolds([holds[0]], [])).toEqual([-1]);
  });
});

describe("autoPoses", () => {
  it("자세 목록이 없을 때 자동으로 만든다", () => {
    const auto = autoPoses({ frames: sequence.frames });
    expect(auto.length).toBe(sequence.poses.length);
    expect(auto[0].name).toBe("자세 1");
  });
});
