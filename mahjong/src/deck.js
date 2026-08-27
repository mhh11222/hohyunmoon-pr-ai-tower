// 인원별 패 구성 — "만자를 뺀다. 둘이면 꽃도 뺀다"
//
//   4인: 140장 (전부)
//   3인: 만자 36장 제외 → 104장
//   2인: 만자 36장 + 꽃 4장 제외 → 100장

import { allTileIds, copiesOf, suitOf, SUIT } from "./tiles.js";
import { shuffle } from "./rng.js";

export const DECK_SIZE = { 2: 100, 3: 104, 4: 140 };

/** 인원별로 빼는 패 종류 */
export function excludedSuits(playerCount) {
  if (playerCount === 4) return [];
  if (playerCount === 3) return [SUIT.CHAR];
  if (playerCount === 2) return [SUIT.CHAR, SUIT.FLOWER];
  throw new Error(`지원하지 않는 인원: ${playerCount} (2·3·4인만)`);
}

/** 정렬된 완성 덱(장수만큼 복제) */
export function buildDeck(playerCount) {
  const drop = excludedSuits(playerCount);
  const deck = [];
  for (const id of allTileIds()) {
    if (drop.includes(suitOf(id))) continue;
    for (let i = 0; i < copiesOf(id); i++) deck.push(id);
  }
  if (deck.length !== DECK_SIZE[playerCount]) {
    throw new Error(`덱 장수 오류: ${deck.length} ≠ ${DECK_SIZE[playerCount]}`);
  }
  return deck;
}

/** 섞기 — 시드 난수라 같은 시드면 같은 판이 나온다 */
export function shuffleDeck(playerCount, rng) {
  return shuffle(buildDeck(playerCount), rng);
}
