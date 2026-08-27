import { describe, it, expect } from "vitest";
import { tween, Timeline, lerp, arc, clamp01, easeOutCubic, easeInOutQuad, linear } from "../ui/anim.js";

describe("보간", () => {
  it("lerp는 양 끝을 정확히 맞춘다", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-2, 2, 0.5)).toBe(0);
  });

  it("클램프", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it("이징은 0에서 0, 1에서 1 (패가 제자리에 정확히 앉는다)", () => {
    for (const ease of [linear, easeOutCubic, easeInOutQuad]) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
    }
  });

  it("포물선은 가운데서 가장 높고 양 끝은 0 (툭 떠서 날아간다)", () => {
    expect(arc(0, 1)).toBeCloseTo(0, 6);
    expect(arc(1, 1)).toBeCloseTo(0, 6);
    expect(arc(0.5, 2)).toBeCloseTo(2, 6);
  });
});

describe("트윈", () => {
  it("진행도가 0에서 1까지 가고 끝나면 멈춘다", () => {
    const seen = [];
    const t = tween({ duration: 0.4, ease: linear, onUpdate: (v) => seen.push(v) });
    t.update(0.2);
    t.update(0.2);
    expect(t.done).toBe(true);
    expect(seen.at(-1)).toBe(1);
    const count = seen.length;
    t.update(0.2);
    expect(seen).toHaveLength(count); // 끝난 뒤에는 더 움직이지 않는다
  });

  it("delay 동안은 시작하지 않는다", () => {
    let started = false;
    const t = tween({ duration: 0.2, delay: 0.3, onUpdate: () => { started = true; } });
    t.update(0.2);
    expect(started).toBe(false);
    t.update(0.2);
    expect(started).toBe(true);
  });

  it("끝나면 onDone이 딱 한 번 불린다", () => {
    let calls = 0;
    const t = tween({ duration: 0.1, onDone: () => calls++ });
    t.update(0.2);
    t.update(0.2);
    expect(calls).toBe(1);
  });
});

describe("타임라인", () => {
  it("모션이 다 끝나면 busy가 풀린다", () => {
    const tl = new Timeline();
    tl.add(tween({ duration: 0.2 }));
    tl.add(tween({ duration: 0.5 }));
    tl.update(0.3);
    expect(tl.busy).toBe(true);
    tl.update(0.3);
    expect(tl.busy).toBe(false);
  });

  it("wait()는 모션이 끝나면 풀린다", async () => {
    const tl = new Timeline();
    tl.add(tween({ duration: 0.1 }));
    const waiting = tl.wait();
    let resolved = false;
    waiting.then(() => { resolved = true; });
    tl.update(0.2);
    await waiting;
    expect(resolved).toBe(true);
  });

  it("아무것도 없으면 wait()는 바로 풀린다", async () => {
    await new Timeline().wait();
  });

  it("clear는 진행 중인 모션을 전부 버린다", () => {
    const tl = new Timeline();
    tl.add(tween({ duration: 5 }));
    tl.clear();
    expect(tl.busy).toBe(false);
  });
});
