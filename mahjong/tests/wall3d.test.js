import { describe, it, expect } from "vitest";
import { wallCounts, computeWallSequence } from "../ui/table3d.js";

describe("산 배분 — 인원수대로 고르게 (엔진과 같은 규칙)", () => {
  it("2인 100장이면 두 벽 다 벽돌 25개", () => {
    expect(wallCounts(100, 2)).toEqual([25, 25]);
  });
  it("3인 104장 → 18/17/17, 4인 140장 → 18/18/17/17", () => {
    expect(wallCounts(104, 3)).toEqual([18, 17, 17]);
    expect(wallCounts(140, 4)).toEqual([18, 18, 17, 17]);
  });
});

describe("뽑기 순서 — 입구에서 시작해 담을 따라 돈다", () => {
  it("모든 패가 정확히 한 번씩 자리를 얻는다", () => {
    const { seq } = computeWallSequence(100, 2, { wallIndex: 1, stackIndex: 8 });
    expect(seq).toHaveLength(100);
    const keys = new Set(seq.map((e) => `${e.wall}-${e.stack}-${e.tier}`));
    expect(keys.size).toBe(100);
  });

  it("첫 장은 입구 벽돌의 위 칸", () => {
    const { seq } = computeWallSequence(100, 2, { wallIndex: 1, stackIndex: 8 });
    expect(seq[0]).toEqual({ wall: 1, stack: 8, tier: 1 });
    expect(seq[1]).toEqual({ wall: 1, stack: 8, tier: 0 });
  });

  it("입구 앞의 건너뛴 벽돌들이 맨 뒤(보충하는 쪽)에 온다", () => {
    const { seq } = computeWallSequence(100, 2, { wallIndex: 1, stackIndex: 8 });
    const tail = seq.slice(-16); // 벽돌 8개 × 2장
    expect(tail.every((e) => e.wall === 1 && e.stack < 8)).toBe(true);
    expect(tail[tail.length - 1]).toEqual({ wall: 1, stack: 7, tier: 0 });
  });

  it("벽을 도는 순서는 입구 벽 → 다음 벽", () => {
    const { seq } = computeWallSequence(140, 4, { wallIndex: 2, stackIndex: 0 });
    const wallsInOrder = [];
    for (const e of seq) if (wallsInOrder.at(-1) !== e.wall) wallsInOrder.push(e.wall);
    expect(wallsInOrder).toEqual([2, 3, 0, 1]);
  });

  it("입구가 0번이면 건너뛴 벽돌이 없다", () => {
    const { seq } = computeWallSequence(100, 2, { wallIndex: 0, stackIndex: 0 });
    expect(seq[0]).toEqual({ wall: 0, stack: 0, tier: 1 });
    expect(seq[99]).toEqual({ wall: 1, stack: 24, tier: 0 });
  });
});
