// 트윈 — 3D 모션의 시간 축. three.js 없이도 돌아가는 순수 계산이라 테스트할 수 있다.

export const linear = (t) => t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 포물선 — 패가 툭 떠서 날아가는 느낌 */
export function arc(t, height = 1) {
  return Math.sin(Math.PI * t) * height;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 트윈 하나. update(dt)를 계속 부르면 0→1 진행도를 onUpdate로 넘겨준다.
 * done이 되면 더 이상 진행하지 않는다.
 */
export function tween({ duration = 0.4, delay = 0, ease = easeOutCubic, onUpdate, onDone }) {
  let elapsed = 0;
  let finished = false;
  let started = false;
  return {
    get done() { return finished; },
    update(dt) {
      if (finished) return true;
      elapsed += dt;
      const time = elapsed - delay;
      if (time < 0) return false;
      if (!started) { started = true; }
      const raw = duration <= 0 ? 1 : clamp01(time / duration);
      onUpdate?.(ease(raw), raw);
      if (raw >= 1) {
        finished = true;
        onDone?.();
      }
      return finished;
    },
  };
}

/** 트윈 묶음. 모션이 다 끝났는지(busy) 물어볼 수 있다. */
export class Timeline {
  constructor() {
    this.items = [];
    this.waiters = [];
  }
  add(item) {
    this.items.push(item);
    return item;
  }
  /** 여러 트윈이 끝나면 풀리는 약속 */
  wait() {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  update(dt) {
    for (const item of this.items) item.update(dt);
    this.items = this.items.filter((i) => !i.done);
    if (!this.items.length && this.waiters.length) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const resolve of waiters) resolve();
    }
  }
  get busy() {
    return this.items.length > 0;
  }
  clear() {
    this.items = [];
    this.waiters = [];
  }
}
