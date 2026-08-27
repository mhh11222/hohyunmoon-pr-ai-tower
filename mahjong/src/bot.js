// 봇 — STEP A에서는 "초보" 하나만. 보통·고수는 STEP E에서.
//
// 기본 원칙: 외톨이 글자패·끝수 먼저 버림, 무늬 좁히기, 텐파이 지향.

import { isHonor, isNumber, isTerminal, rankOf, suitOf, tileOrder } from "./tiles.js";
import { countReadySets, isWinningHand, waitingTiles } from "./hand.js";
import { CALL } from "./calls.js";

export const LEVEL = { BEGINNER: "beginner" };

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

/** 무엇을 버릴까 — 가장 쓸모없는 패, 같으면 글자패·끝수 쪽 */
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
 * 초보 봇은 완성이면 무조건, 펑은 거의 항상, 치는 손이 덜 됐을 때만.
 */
export function chooseCall(concealed, melds, calls) {
  const win = calls.find((c) => c.type === CALL.WIN);
  if (win) return win;
  const ready = countReadySets(concealed) + melds.length;
  const pong = calls.find((c) => c.type === CALL.PONG);
  if (pong) return pong;
  const kong = calls.find((c) => c.type === CALL.KONG);
  if (kong) return kong;
  const chow = calls.find((c) => c.type === CALL.CHOW);
  if (chow && ready < 4) return chow;
  return null; // 패스 — 부르기는 의무가 아니다
}

/** 봇 한 명의 판단 묶음 */
export function makeBot(level = LEVEL.BEGINNER) {
  return {
    level,
    discard: (p) => chooseDiscard(p.concealed),
    call: (p, calls) => chooseCall(p.concealed, p.melds, calls),
    wantsWin: (p) => isWinningHand(p.concealed, p.melds.length),
    waits: (p) => waitingTiles(p.concealed, p.melds.length),
  };
}
