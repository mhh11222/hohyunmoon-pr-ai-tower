// 봇 — 난이도 3단계.
//   초보: 랜덤 없이 기본 원칙만 (외톨이 글자패·끝수 먼저, 무늬 좁히기)
//   보통: 효율 계산 — 버린 뒤 손이 가장 좋아지는 패를 버린다
//   고수: 보통 + 텐파이·안전패 — 상대가 익어 보이면 이미 버려진 패로 돌린다

import { isHonor, isNumber, isTerminal, rankOf, suitOf, tileOrder } from "./tiles.js";
import { countReadySets, isWinningHand, waitingTiles, toCounts } from "./hand.js";
import { CALL } from "./calls.js";

export const LEVEL = { BEGINNER: "beginner", NORMAL: "normal", EXPERT: "expert" };

export const LEVEL_INFO = [
  { key: LEVEL.BEGINNER, name: "초보", desc: "기본 원칙만 지킨다" },
  { key: LEVEL.NORMAL, name: "보통", desc: "버릴 때마다 효율을 계산한다" },
  { key: LEVEL.EXPERT, name: "고수", desc: "텐파이를 서두르고 안전패를 고른다" },
];

/** 패 하나가 손패에서 얼마나 쓸모 있는지 (클수록 지킬 값어치) */
export function tileUsefulness(concealed, tile) {
  const same = concealed.filter((t) => t === tile).length;
  let score = same * 12; // 짝·세쌍둥이 씨앗
  if (isNumber(tile)) {
    const suit = suitOf(tile);
    const rank = rankOf(tile);
    for (const d of [-2, -1, 1, 2]) {
      const near = `${suit}${rank + d}`;
      if (concealed.includes(near)) score += Math.abs(d) === 1 ? 6 : 3;
    }
    score += 3 - Math.abs(5 - rank) * 0.5; // "가운데(4·5·6)는 인기 많다"
    if (isTerminal(tile)) score -= 2;      // "끝(1·9)은 외롭다"
  } else if (isHonor(tile)) {
    if (same === 1) score -= 4;            // 외톨이 글자패부터
  }
  return score;
}

/** 무엇을 버릴까 — 가장 쓸모없는 패, 같으면 글자패·끝수 쪽 (초보) */
export function chooseDiscard(concealed) {
  let best = null;
  for (const tile of concealed) {
    const score = tileUsefulness(concealed, tile);
    if (
      best === null ||
      score < best.score ||
      (score === best.score && tileOrder(tile) > tileOrder(best.tile))
    ) {
      best = { tile, score };
    }
  }
  return best.tile;
}

/** 손 전체가 얼마나 익었는지 — 보통·고수가 버릴 패를 고를 때 쓴다 */
export function handQuality(concealed) {
  const counts = toCounts(concealed);
  const pairs = Object.values(counts).filter((n) => n >= 2).length;
  let quality = countReadySets(concealed) * 100 + Math.min(pairs, 2) * 14;
  for (const tile of new Set(concealed)) quality += tileUsefulness(concealed, tile) * 0.1;
  return quality;
}

/** 보통: 각 패를 빼 보고 남는 손이 가장 좋은 쪽 */
export function chooseDiscardNormal(concealed) {
  let best = null;
  for (const tile of new Set(concealed)) {
    const rest = concealed.slice();
    rest.splice(rest.indexOf(tile), 1);
    const quality = handQuality(rest);
    if (
      best === null ||
      quality > best.quality ||
      (quality === best.quality && tileOrder(tile) > tileOrder(best.tile))
    ) {
      best = { tile, quality };
    }
  }
  return best.tile;
}

/**
 * 고수: 보통과 같은 효율 계산에, 상대 중 누가 익어 보이면(공개 묶음 2개 이상)
 * 거의 같은 효율 안에서는 이미 강에 버려진 적 있는 패(안전패)를 고른다.
 * context = { discards: [...모든 버림패], danger: boolean }
 */
export function chooseDiscardExpert(concealed, context = {}) {
  const { discards = [], danger = false } = context;
  const options = [];
  for (const tile of new Set(concealed)) {
    const rest = concealed.slice();
    rest.splice(rest.indexOf(tile), 1);
    options.push({ tile, quality: handQuality(rest) });
  }
  options.sort((a, b) => b.quality - a.quality || tileOrder(b.tile) - tileOrder(a.tile));
  const top = options[0];
  if (danger) {
    const seen = new Set(discards);
    const safe = options.find((o) => seen.has(o.tile) && o.quality >= top.quality - 8);
    if (safe) return safe.tile;
  }
  return top.tile;
}

/** 버릴 이유를 한 줄로 — 학습 모드 코치가 그대로 쓴다 */
export function discardReason(concealed, tile) {
  const same = concealed.filter((t) => t === tile).length;
  if (isHonor(tile) && same === 1) return "외톨이 글자패 — 계단이 안 되니 제일 먼저 버린다";
  if (isTerminal(tile)) return "끝수(1·9)는 이어지는 길이 한쪽뿐이라 외롭다";
  if (same >= 2) return "짝이 있지만 다른 쪽이 더 급하다";
  return "이어질 이웃이 없어 가장 쓸모가 적다";
}

/**
 * 부를까 말까. "급하면 부르고, 크게 먹으려면 참는다"
 * 초보: 완성 무조건, 펑 거의 항상, 치는 손이 덜 됐을 때만.
 * 보통·고수: 부르면 손이 실제로 좋아질 때만. 고수는 텐파이 직전이면 참고
 * 직접 뽑기 보너스를 노린다.
 */
export function chooseCall(concealed, melds, calls, level = LEVEL.BEGINNER) {
  const win = calls.find((c) => c.type === CALL.WIN);
  if (win) return win;
  const ready = countReadySets(concealed) + melds.length;

  if (level === LEVEL.BEGINNER) {
    const pong = calls.find((c) => c.type === CALL.PONG);
    if (pong) return pong;
    const kong = calls.find((c) => c.type === CALL.KONG);
    if (kong) return kong;
    const chow = calls.find((c) => c.type === CALL.CHOW);
    if (chow && ready < 4) return chow;
    return null;
  }

  // 보통·고수: 묶음이 실제로 하나 늘어나는지 본다
  const better = calls.find((c) => c.type === CALL.PONG || c.type === CALL.KONG || c.type === CALL.CHOW);
  if (!better) return null;
  if (level === LEVEL.EXPERT && ready >= 4) return null; // 텐파이 직전 — 참고 직접 뽑는다
  const used = better.tiles.filter((t) => t !== better.tiles[better.tiles.length]);
  void used;
  const rest = concealed.slice();
  for (const t of better.tiles) {
    const at = rest.indexOf(t);
    if (at >= 0) rest.splice(at, 1);
  }
  const after = countReadySets(rest) + melds.length + 1;
  return after > ready ? better : null;
}

/** 봇 한 명의 판단 묶음. context는 고수의 안전패 계산에 쓴다. */
export function makeBot(level = LEVEL.BEGINNER) {
  const discard = {
    [LEVEL.BEGINNER]: (p) => chooseDiscard(p.concealed),
    [LEVEL.NORMAL]: (p) => chooseDiscardNormal(p.concealed),
    [LEVEL.EXPERT]: (p, context) => chooseDiscardExpert(p.concealed, context),
  }[level];
  return {
    level,
    discard,
    call: (p, calls) => chooseCall(p.concealed, p.melds, calls, level),
    wantsWin: (p) => isWinningHand(p.concealed, p.melds.length),
    waits: (p) => waitingTiles(p.concealed, p.melds.length),
  };
}

/** 고수 봇이 쓸 판 정보 — 모든 버림패와 위험 신호 */
export function botContext(game, seat) {
  const discards = game.players.flatMap((p) => p.discards);
  const danger = game.players.some((p) => p.seat !== seat && p.melds.length >= 2);
  return { discards, danger };
}
