// 시드 기반 난수 — 테스트 재현성을 위해 Math.random을 쓰지 않는다.

/** mulberry32: 32비트 시드 → [0,1) 난수 스트림 */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 이상 max 미만 정수 */
export function randInt(rng, max) {
  return Math.floor(rng() * max);
}

/** Fisher-Yates. 원본을 건드리지 않고 새 배열을 돌려준다. */
export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 주사위 1개 (1~6) */
export function rollDie(rng) {
  return randInt(rng, 6) + 1;
}

/** 주사위 2개 — { dice: [a, b], sum } */
export function rollDice(rng) {
  const dice = [rollDie(rng), rollDie(rng)];
  return { dice, sum: dice[0] + dice[1] };
}
