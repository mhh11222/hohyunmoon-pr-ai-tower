// 손패 판정 — 완성형 = 3장짜리 묶음 5개 + 짝 1개 = 17장
//
// 묶음은 두 종류
//   계단(順): 같은 무늬 연속 3장. 글자패 불가, 9→1 불가. "계단은 같은 재질만"
//   세쌍둥이(刻): 완전 똑같은 3장. "세쌍둥이는 누구나"
// 짝(對)은 딱 하나. "머리 없는 참새는 못 난다"

import { isFlower, isHonor, isNumber, rankOf, suitOf, sortTiles, allTileIds, copiesOf } from "./tiles.js";

export const SETS_TO_WIN = 5;
export const HAND_SIZE = 16;       // 손패
export const DEALER_HAND_SIZE = 17; // 딜러(와 뽑은 직후)

/** 패 배열 → { id: 개수 } (꽃은 손패에 없다고 본다) */
export function toCounts(tiles) {
  const counts = {};
  for (const id of tiles) {
    if (isFlower(id)) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

export function countsToTiles(counts) {
  const tiles = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) tiles.push(id);
  }
  return sortTiles(tiles);
}

function firstTile(counts) {
  let best = null;
  for (const [id, n] of Object.entries(counts)) {
    if (n <= 0) continue;
    if (best === null || id < best) best = id;
  }
  return best;
}

/** counts에서 setsNeeded개의 묶음을 뽑아낼 수 있으면 그 조합을 돌려준다 */
function takeSets(counts, setsNeeded) {
  if (setsNeeded === 0) {
    return Object.values(counts).every((n) => n === 0) ? [] : null;
  }
  const id = firstTile(counts);
  if (id === null) return null;

  // 세쌍둥이 먼저
  if (counts[id] >= 3) {
    counts[id] -= 3;
    const rest = takeSets(counts, setsNeeded - 1);
    counts[id] += 3;
    if (rest) return [{ type: "triplet", tiles: [id, id, id] }, ...rest];
  }

  // 계단 (숫자패만, 9→1 없음)
  if (isNumber(id)) {
    const suit = suitOf(id);
    const rank = rankOf(id);
    if (rank <= 7) {
      const b = `${suit}${rank + 1}`;
      const c = `${suit}${rank + 2}`;
      if (counts[b] > 0 && counts[c] > 0) {
        counts[id]--; counts[b]--; counts[c]--;
        const rest = takeSets(counts, setsNeeded - 1);
        counts[id]++; counts[b]++; counts[c]++;
        if (rest) return [{ type: "run", tiles: [id, b, c] }, ...rest];
      }
    }
  }
  return null;
}

/**
 * 완성 판정 + 분해.
 * concealed: 손 안의 패, meldCount: 이미 공개한 묶음 수.
 * 완성이면 { sets, pair }, 아니면 null.
 */
export function decompose(concealed, meldCount = 0) {
  const setsNeeded = SETS_TO_WIN - meldCount;
  if (concealed.length !== setsNeeded * 3 + 2) return null;
  const counts = toCounts(concealed);
  for (const id of Object.keys(counts)) {
    if (counts[id] < 2) continue;
    counts[id] -= 2;
    const sets = takeSets(counts, setsNeeded);
    counts[id] += 2;
    if (sets) return { sets, pair: [id, id] };
  }
  return null;
}

export function isWinningHand(concealed, meldCount = 0) {
  return decompose(concealed, meldCount) !== null;
}

/** 완성까지 몇 묶음 됐는지 — 손패 코치용 (겹치지 않게 그리디로 센다) */
export function countReadySets(concealed) {
  const counts = toCounts(concealed);
  let sets = 0;
  const greedy = (c) => {
    const id = firstTile(c);
    if (id === null) return 0;
    if (c[id] >= 3) { c[id] -= 3; return 1 + greedy(c); }
    if (isNumber(id)) {
      const suit = suitOf(id), rank = rankOf(id);
      const b = `${suit}${rank + 1}`, cc = `${suit}${rank + 2}`;
      if (rank <= 7 && c[b] > 0 && c[cc] > 0) {
        c[id]--; c[b]--; c[cc]--; return 1 + greedy(c);
      }
    }
    c[id]--;
    return greedy(c);
  };
  sets = greedy({ ...counts });
  return Math.min(sets, SETS_TO_WIN);
}

/**
 * 대기패 — "○○ 오면 완성". concealed는 뽑기 전(16장 또는 3n+1장) 상태.
 * seen: 이미 보이는 패들(내 손·버림패·공개 묶음) — 남은 장수가 0이면 대기에서 뺀다.
 */
export function waitingTiles(concealed, meldCount = 0, { deckIds = null, seen = null } = {}) {
  const setsNeeded = SETS_TO_WIN - meldCount;
  if (concealed.length !== setsNeeded * 3 + 1) return [];
  const candidates = deckIds || allTileIds();
  const waits = [];
  for (const id of candidates) {
    if (isFlower(id)) continue;
    if (seen && (seen[id] || 0) >= copiesOf(id)) continue;
    if (isWinningHand([...concealed, id], meldCount)) waits.push(id);
  }
  return waits;
}

export function isTenpai(concealed, meldCount = 0, opts) {
  return waitingTiles(concealed, meldCount, opts).length > 0;
}

/** 손패를 통→삭→만→바람→삼원 순으로 */
export { sortTiles };

/** 글자패/끝수 여부 — 코치 힌트에서 쓴다 */
export { isHonor };
