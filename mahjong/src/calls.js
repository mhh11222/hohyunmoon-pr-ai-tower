// 부르기 — 펑(碰)·치(吃)·깡(槓)·완성(胡)
//
//   펑: 같은 패 2장 보유 + 누가 그 패 버림. 누구한테서나.
//   치: 계단 조각 2장 보유 + 모자란 1장. 내 바로 왼쪽 사람이 버린 것만.
//       "계단은 위에서 굴러 내려온다"
//   깡: 같은 패 4장. 옵션(기본 OFF).
//   완성: 짝만 모자랄 때 그 패가 버려지면 남의 패로도 이길 수 있다.
//   우선순위: 완성 > 펑·깡 > 치. "이기는 게 먹는 것보다 세고, 세쌍둥이가 계단보다 세다"

import { isNumber, rankOf, suitOf } from "./tiles.js";
import { isWinningHand } from "./hand.js";

export const CALL = { WIN: "win", KONG: "kong", PONG: "pong", CHOW: "chow" };

const PRIORITY = { win: 3, kong: 2, pong: 2, chow: 1 };

/** 내 바로 왼쪽 사람(= 내 앞 차례) — 치를 받을 수 있는 유일한 상대 */
export function leftOf(seat, playerCount) {
  return (seat - 1 + playerCount) % playerCount;
}

/** 내 다음 차례 = 오른쪽 사람. "마작 테이블 시계는 거꾸로 간다" */
export function rightOf(seat, playerCount) {
  return (seat + 1) % playerCount;
}

function countOf(concealed, tile) {
  let n = 0;
  for (const id of concealed) if (id === tile) n++;
  return n;
}

export function canPong(concealed, tile) {
  return countOf(concealed, tile) >= 2;
}

/** 버려진 패로 깡 (대명깡) — 손에 3장 */
export function canKong(concealed, tile) {
  return countOf(concealed, tile) >= 3;
}

/** 손 안에 4장 (안깡) */
export function concealedKongs(concealed) {
  const counts = {};
  for (const id of concealed) counts[id] = (counts[id] || 0) + 1;
  return Object.keys(counts).filter((id) => counts[id] === 4);
}

/** 치 조합들 — [[p1,p2],[p2,p4],[p4,p5]] 식으로 쓸 수 있는 짝 조각 목록 */
export function chowOptions(concealed, tile) {
  if (!isNumber(tile)) return [];
  const suit = suitOf(tile);
  const rank = rankOf(tile);
  const has = (r) => r >= 1 && r <= 9 && concealed.includes(`${suit}${r}`);
  const combos = [];
  if (has(rank - 2) && has(rank - 1)) combos.push([`${suit}${rank - 2}`, `${suit}${rank - 1}`]);
  if (has(rank - 1) && has(rank + 1)) combos.push([`${suit}${rank - 1}`, `${suit}${rank + 1}`]);
  if (has(rank + 1) && has(rank + 2)) combos.push([`${suit}${rank + 1}`, `${suit}${rank + 2}`]);
  return combos;
}

export function canChow(concealed, tile, { seat, from, playerCount }) {
  if (from !== leftOf(seat, playerCount)) return false; // 왼쪽 사람만
  return chowOptions(concealed, tile).length > 0;
}

export function canWinOnDiscard(concealed, tile, meldCount = 0) {
  return isWinningHand([...concealed, tile], meldCount);
}

/**
 * 버려진 패 하나에 대해 각 플레이어가 부를 수 있는 것들.
 * players: [{ seat, concealed, melds }]
 * 반환: [{ seat, type, tiles }] — 부르기는 의무가 아니라 선택이므로 "가능 목록"일 뿐.
 */
export function availableCalls(players, tile, from, { allowKong = false } = {}) {
  const playerCount = players.length;
  const out = [];
  for (const p of players) {
    if (p.seat === from) continue;
    const melds = p.melds || [];
    if (canWinOnDiscard(p.concealed, tile, melds.length)) {
      out.push({ seat: p.seat, type: CALL.WIN, tiles: [tile] });
    }
    if (allowKong && canKong(p.concealed, tile)) {
      out.push({ seat: p.seat, type: CALL.KONG, tiles: [tile, tile, tile, tile] });
    }
    if (canPong(p.concealed, tile)) {
      out.push({ seat: p.seat, type: CALL.PONG, tiles: [tile, tile, tile] });
    }
    if (canChow(p.concealed, tile, { seat: p.seat, from, playerCount })) {
      for (const combo of chowOptions(p.concealed, tile)) {
        out.push({ seat: p.seat, type: CALL.CHOW, tiles: [...combo, tile].sort() });
      }
    }
  }
  return out;
}

/**
 * 동시에 여러 명이 불렀을 때 승자 하나를 고른다.
 * 같은 우선순위면 버린 사람 기준으로 차례가 가까운 쪽.
 */
export function resolveCalls(claims, from, playerCount) {
  if (claims.length === 0) return null;
  const distance = (seat) => (seat - from + playerCount) % playerCount;
  return claims.slice().sort((a, b) => {
    const d = PRIORITY[b.type] - PRIORITY[a.type];
    if (d !== 0) return d;
    return distance(a.seat) - distance(b.seat);
  })[0];
}
