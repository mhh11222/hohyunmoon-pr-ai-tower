// 뷰어가 실제로 읽는 데이터 파일(data/sequence.js)이 깨지지 않았는지
import { describe, it, expect } from "vitest";
import { validateSequence } from "../src/sequence.js";
import { jointAngles } from "../src/angles.js";
import { sequence } from "../data/sequence.js";

describe("data/sequence.js", () => {
  it("무결성 검사를 통과한다", () => {
    expect(validateSequence(sequence)).toEqual([]);
    expect(sequence.poses.length).toBeGreaterThan(0);
  });
  it("모든 자세에 이름과 영상 구간이 있고, 구간은 시간순", () => {
    let last = -1;
    for (const p of sequence.poses) {
      expect(p.name).toBeTruthy();
      expect(p.start).toBeGreaterThanOrEqual(last);
      last = p.end;
    }
  });
  it("모든 프레임에서 각도 계산이 NaN 없이 된다 (10프레임마다 표본)", () => {
    for (let i = 0; i < sequence.frames.length; i += 10) {
      for (const a of jointAngles(sequence.frames[i].lm)) expect(Number.isFinite(a.value)).toBe(true);
    }
  });
});
