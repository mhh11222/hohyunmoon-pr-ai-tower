// 산(벽) 쌓기 · 주사위 · 입구 · 배패 · 꽃 보충
//
// 산은 2단으로 쌓은 "이어진 하나의 담"이다. 입구부터 앞으로 뽑고,
// 꽃·깡 보충은 담의 뒤쪽 끝에서 가져온다.

import { isFlower } from "./tiles.js";
import { rollDice } from "./rng.js";

/** 인원별 벽 개수 — 4인 사각, 3인 삼각, 2인 마주 보는 두 벽 */
export const WALL_COUNT = { 2: 2, 3: 3, 4: 4 };

/**
 * 2단 벽 쌓기. 벽돌(stack) 하나 = [위, 아래] 2장.
 * 벽마다 벽돌 수를 최대한 고르게 나눈다.
 */
export function buildWalls(tiles, wallCount) {
  if (tiles.length % 2 !== 0) throw new Error("산은 2단이라 짝수 장이어야 한다");
  const stacks = [];
  for (let i = 0; i < tiles.length; i += 2) stacks.push([tiles[i], tiles[i + 1]]);

  const walls = [];
  let cursor = 0;
  let left = stacks.length;
  for (let w = 0; w < wallCount; w++) {
    const size = Math.ceil(left / (wallCount - w));
    walls.push(stacks.slice(cursor, cursor + size));
    cursor += size;
    left -= size;
  }
  return walls;
}

/**
 * 주사위로 입구 정하기.
 *   1) 딜러부터 반시계로 합만큼 세서 벽 하나 선택
 *   2) 그 벽의 오른쪽 끝에서 합만큼 벽돌을 세고, 그 다음 벽돌이 입구
 */
export function chooseOpening(walls, dealerIndex, sum) {
  const wallCount = walls.length;
  const wallIndex = (dealerIndex + sum - 1) % wallCount;
  const stackIndex = sum % walls[wallIndex].length;
  return { wallIndex, stackIndex };
}

/** 입구부터 담을 한 줄로 편 뽑기 순서 (벽돌은 위→아래) */
export function drawOrderFrom(walls, opening) {
  const flat = [];
  const wallCount = walls.length;
  for (let w = 0; w < wallCount; w++) {
    const wall = walls[(opening.wallIndex + w) % wallCount];
    for (let s = 0; s < wall.length; s++) {
      const idx = w === 0 ? opening.stackIndex + s : s;
      if (idx >= wall.length) continue;
      flat.push(wall[idx][0], wall[idx][1]);
    }
  }
  // 첫 벽에서 입구보다 앞이라 건너뛴 벽돌들은 담의 맨 뒤로 이어 붙는다.
  const head = walls[opening.wallIndex].slice(0, opening.stackIndex);
  for (const stack of head) flat.push(stack[0], stack[1]);
  return flat;
}

/** 섞인 패 → 산 쌓기 → 주사위 → 입구까지 한 번에 */
export function openWall(tiles, playerCount, dealerIndex, rng) {
  const walls = buildWalls(tiles, WALL_COUNT[playerCount]);
  const { dice, sum } = rollDice(rng);
  const opening = chooseOpening(walls, dealerIndex, sum);
  return { walls, dice, sum, opening, drawPile: drawOrderFrom(walls, opening) };
}

/**
 * 배패 — 입구부터 벽돌 2개(4장)씩 딜러→다음→… 4바퀴, 딜러만 1장 더.
 * 손패는 16장, 딜러는 17장.
 */
export function dealHands(drawPile, playerCount, dealerIndex) {
  const pile = drawPile.slice();
  const hands = Array.from({ length: playerCount }, () => []);
  for (let round = 0; round < 4; round++) {
    for (let n = 0; n < playerCount; n++) {
      const seat = (dealerIndex + n) % playerCount;
      hands[seat].push(...pile.splice(0, 4));
    }
  }
  hands[dealerIndex].push(pile.shift());
  return { hands, pile };
}

/**
 * 꽃패 처리 — 꽃은 눕히고 담 뒤쪽에서 1장 보충. 안 나올 때까지, 딜러부터 순서대로.
 * hands·pile을 직접 수정하고 무슨 일이 있었는지 기록을 돌려준다.
 */
export function resolveFlowers(hands, pile, dealerIndex) {
  const playerCount = hands.length;
  const flowers = Array.from({ length: playerCount }, () => []);
  const events = [];
  let anyFlower = true;
  while (anyFlower) {
    anyFlower = false;
    for (let n = 0; n < playerCount; n++) {
      const seat = (dealerIndex + n) % playerCount;
      for (;;) {
        const at = hands[seat].findIndex(isFlower);
        if (at < 0) break;
        const flower = hands[seat].splice(at, 1)[0];
        flowers[seat].push(flower);
        const replacement = pile.pop(); // 담의 뒤쪽에서 보충
        if (replacement === undefined) throw new Error("보충할 패가 없다");
        hands[seat].push(replacement);
        events.push({ seat, flower, replacement });
        anyFlower = true;
      }
    }
  }
  return { flowers, events };
}
