// 점수 — "쉬운 길을 포기할수록 점수가 오른다"
//
//   받는 점수 = 기본점 + (보너스 합계 × 보너스점)   [기본 10 / 10 → (보너스+1)×10]
//   기본 보너스 4가지: 안 부르고 · 직접 뽑아 · 내 꽃 · 中發白 세쌍둥이
//   특칙: "안 부르고 + 직접 뽑아"는 1+1=2가 아니라 3으로 친다.

import { DRAGONS, SEAT_FLOWER, SEAT_WIND, isHonor, isNumber, suitOf } from "./tiles.js";

export const DEFAULT_OPTIONS = {
  basePoint: 10,      // 기본점
  bonusPoint: 10,     // 보너스 1개당
  extendedBonuses: false, // 확장 보너스(混一色·清一色·大三元…) 토글
  allowKong: false,
};

/** 확장 보너스 표 */
export const EXTENDED = [
  { key: "mixedSuit",   name: "混一色 (한무늬+글자)", value: 4 },
  { key: "allTriplets", name: "碰碰胡 (세쌍둥이만)", value: 4 },
  { key: "smallDragons", name: "小三元", value: 4 },
  { key: "seatWind",    name: "門風 (내 자리 바람)", value: 1 },
  { key: "pureSuit",    name: "清一色 (단 한무늬)", value: 8 },
  { key: "bigDragons",  name: "大三元", value: 8 },
  { key: "bigWinds",    name: "大四喜", value: 16 },
  { key: "allHonors",   name: "字一色 (글자패로만)", value: 16 },
];

// 포함 관계 — 큰 쪽이 있으면 작은 쪽은 세지 않는다
const SUPPRESSES = {
  pureSuit: ["mixedSuit"],
  bigDragons: ["smallDragons", "dragonTriplet"],
  smallDragons: ["dragonTriplet"],
  bigWinds: ["seatWind"],
  allHonors: ["allTriplets", "mixedSuit"],
};

/** 공개 묶음 + 손 안 분해 → 묶음 5개 목록 */
export function allSets({ melds = [], decomposition }) {
  const fromMelds = melds.map((m) => ({
    type: m.type === "chow" ? "run" : "triplet",
    tiles: m.tiles,
    open: m.type !== "concealed-kong",
  }));
  const fromHand = (decomposition?.sets || []).map((s) => ({ ...s, open: false }));
  return [...fromMelds, ...fromHand];
}

function tripletOf(sets, tile) {
  return sets.some((s) => s.type === "triplet" && s.tiles[0] === tile);
}

/**
 * 보너스 세기.
 * ctx = { seat, melds, decomposition, flowers, isSelfDraw, options }
 * 반환: { bonuses: [{key,name,value}], total }
 */
export function countBonuses(ctx) {
  const options = { ...DEFAULT_OPTIONS, ...(ctx.options || {}) };
  const sets = allSets(ctx);
  const pair = ctx.decomposition?.pair || [];
  const tiles = [...sets.flatMap((s) => s.tiles), ...pair];
  // 남의 패를 가져와 만든 묶음이 하나라도 있으면 "부른" 것 (안깡은 부른 게 아니다)
  const hasCalled = (ctx.melds || []).some((m) => m.type !== "concealed-kong");

  const found = [];
  const add = (key, name, value) => found.push({ key, name, value });

  // --- 기본 보너스 ---
  if (!hasCalled && ctx.isSelfDraw) {
    add("concealedSelfDraw", "안 부르고 + 직접 뽑아 이김", 3); // 특칙
  } else {
    if (!hasCalled) add("concealed", "안 부르고 이김", 1);
    if (ctx.isSelfDraw) add("selfDraw", "직접 뽑아 이김", 1);
  }
  const myFlower = SEAT_FLOWER[ctx.seat];
  if ((ctx.flowers || []).includes(myFlower)) {
    add("seatFlower", `내 꽃 (${ctx.seat} = ${myFlower})`, 1);
  }
  for (const d of DRAGONS) {
    if (tripletOf(sets, d)) add("dragonTriplet", `삼원 세쌍둥이 (${d})`, 1);
  }

  // --- 확장 보너스 ---
  if (options.extendedBonuses) {
    const numberSuits = new Set(tiles.filter(isNumber).map(suitOf));
    const hasHonor = tiles.some(isHonor);
    const dragonTriplets = DRAGONS.filter((d) => tripletOf(sets, d)).length;
    const dragonPair = DRAGONS.includes(pair[0]);
    const windTriplets = ["z1", "z2", "z3", "z4"].filter((w) => tripletOf(sets, w)).length;

    if (numberSuits.size === 0 && hasHonor) push(found, "allHonors");
    if (numberSuits.size === 1 && !hasHonor) push(found, "pureSuit");
    if (numberSuits.size === 1 && hasHonor) push(found, "mixedSuit");
    if (sets.length > 0 && sets.every((s) => s.type === "triplet")) push(found, "allTriplets");
    if (dragonTriplets === 3) push(found, "bigDragons");
    else if (dragonTriplets === 2 && dragonPair) push(found, "smallDragons");
    if (windTriplets === 4) push(found, "bigWinds");
    if (tripletOf(sets, SEAT_WIND[ctx.seat])) push(found, "seatWind");
  }

  // 포함 관계 정리
  const keys = new Set(found.map((b) => b.key));
  const killed = new Set();
  for (const key of keys) for (const k of SUPPRESSES[key] || []) killed.add(k);
  const bonuses = found.filter((b) => !killed.has(b.key));

  return { bonuses, total: bonuses.reduce((sum, b) => sum + b.value, 0) };
}

function push(found, key) {
  const spec = EXTENDED.find((e) => e.key === key);
  found.push({ key, name: spec.name, value: spec.value });
}

/** 보너스 합계 → 받을 점수 */
export function handValue(bonusTotal, options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  return o.basePoint + bonusTotal * o.bonusPoint;
}

/**
 * 누가 얼마를 내나.
 *   남이 버린 패로 완성 → 그 사람 혼자 전액. "총 쏜 사람이 혼자 물어낸다"
 *   직접 뽑아 완성 → 나머지 전원이 각각 전액. 단 2인이면 상대가 2배.
 */
export function payments({ winner, discarder, playerCount, value, isSelfDraw }) {
  const out = [];
  if (isSelfDraw) {
    const factor = playerCount === 2 ? 2 : 1; // 2인 특칙
    for (let seat = 0; seat < playerCount; seat++) {
      if (seat === winner) continue;
      out.push({ from: seat, to: winner, amount: value * factor });
    }
  } else {
    out.push({ from: discarder, to: winner, amount: value });
  }
  return out;
}

/** 완성 한 판 정산 한 번에 */
export function scoreWin(ctx) {
  const { bonuses, total } = countBonuses(ctx);
  const value = handValue(total, ctx.options);
  return {
    bonuses,
    bonusTotal: total,
    value,
    payments: payments({
      winner: ctx.winnerIndex,
      discarder: ctx.discarderIndex,
      playerCount: ctx.playerCount,
      value,
      isSelfDraw: ctx.isSelfDraw,
    }),
  };
}
