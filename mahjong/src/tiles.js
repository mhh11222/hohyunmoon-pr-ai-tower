// 패 정의 — 이 파일이 "내 세트 스펙"의 코드판이다.
//
// 표기(id):
//   p1..p9  통(筒) 동그라미
//   s1..s9  삭(索) 막대기 — 1삭은 새(공작), 8삭은 지그재그 W 두 줄
//   m1..m9  만(萬) 한자 — 5만은 '伍'
//   z1..z4  바람 東南西北
//   z5..z7  삼원 中發白 — 백(白)은 무늬 없는 백지패
//   f1..f4  꽃 春夏秋冬 (사계절만, 매란국죽 없음)

export const SUIT = { DOT: "p", BAMBOO: "s", CHAR: "m", HONOR: "z", FLOWER: "f" };

export const NUMBER_SUITS = [SUIT.DOT, SUIT.BAMBOO, SUIT.CHAR];

/** 자리(바람) — 진행은 반시계, 내 다음 차례는 오른쪽 사람 */
export const SEATS = ["east", "south", "west", "north"];

/** 자리별 바람패 */
export const SEAT_WIND = { east: "z1", south: "z2", west: "z3", north: "z4" };

/** 자리별 정화(자기 꽃): 동=春 남=夏 서=秋 북=冬 */
export const SEAT_FLOWER = { east: "f1", south: "f2", west: "f3", north: "f4" };

/** 삼원패 */
export const DRAGONS = ["z5", "z6", "z7"]; // 中 發 白

/** 바람패 */
export const WINDS = ["z1", "z2", "z3", "z4"];

export const HONORS = [...WINDS, ...DRAGONS];

export const FLOWERS = ["f1", "f2", "f3", "f4"];

const NAMES = {
  z1: "東", z2: "南", z3: "西", z4: "北",
  z5: "中", z6: "發", z7: "白",
  f1: "春", f2: "夏", f3: "秋", f4: "冬",
};

const CHAR_DIGITS = ["", "一", "二", "三", "四", "伍", "六", "七", "八", "九"];
const SUIT_LABEL = { p: "통", s: "삭", m: "만" };

export function suitOf(id) {
  return id[0];
}

export function rankOf(id) {
  return Number(id.slice(1));
}

export function isNumber(id) {
  return NUMBER_SUITS.includes(suitOf(id));
}

export function isHonor(id) {
  return suitOf(id) === SUIT.HONOR;
}

export function isFlower(id) {
  return suitOf(id) === SUIT.FLOWER;
}

export function isDragon(id) {
  return DRAGONS.includes(id);
}

export function isWind(id) {
  return WINDS.includes(id);
}

/** 끝수(1·9) — "끝은 외롭다" */
export function isTerminal(id) {
  return isNumber(id) && (rankOf(id) === 1 || rankOf(id) === 9);
}

/** 사람이 읽는 이름: p1 → "1통", m5 → "伍萬", z5 → "中" */
export function tileName(id) {
  if (isHonor(id) || isFlower(id)) return NAMES[id];
  const suit = suitOf(id);
  const rank = rankOf(id);
  if (suit === SUIT.CHAR) return `${CHAR_DIGITS[rank]}萬`;
  return `${rank}${SUIT_LABEL[suit]}`;
}

/** 정렬 순서: 통 → 삭 → 만 → 바람 → 삼원 → 꽃 */
const SUIT_ORDER = { p: 0, s: 1, m: 2, z: 3, f: 4 };

export function tileOrder(id) {
  return SUIT_ORDER[suitOf(id)] * 100 + rankOf(id);
}

/** 손패 자동 정렬 (학습 모드 기본 ON) */
export function sortTiles(tiles) {
  return tiles.slice().sort((a, b) => tileOrder(a) - tileOrder(b));
}

/** 이 세트에 존재하는 모든 패 종류 */
export function allTileIds() {
  const ids = [];
  for (const suit of NUMBER_SUITS) {
    for (let r = 1; r <= 9; r++) ids.push(`${suit}${r}`);
  }
  return [...ids, ...HONORS, ...FLOWERS];
}

/** 이 세트에서 그 패가 몇 장인지 — 꽃만 1장, 나머지는 4장 */
export function copiesOf(id) {
  return isFlower(id) ? 1 : 4;
}
