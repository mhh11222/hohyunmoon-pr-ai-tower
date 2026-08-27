import { describe, it, expect } from "vitest";
import { buildWalls, chooseOpening, drawOrderFrom, openWall, dealHands, resolveFlowers, WALL_COUNT } from "../src/wall.js";
import { shuffleDeck, buildDeck } from "../src/deck.js";
import { makeRng, rollDice } from "../src/rng.js";
import { isFlower } from "../src/tiles.js";

describe("산 쌓기", () => {
  it("벽 개수는 4인 4 / 3인 3 / 2인 2", () => {
    expect(WALL_COUNT).toEqual({ 2: 2, 3: 3, 4: 4 });
  });

  it("2단 벽돌로 나누고 한 장도 잃지 않는다", () => {
    const deck = buildDeck(4);
    const walls = buildWalls(deck, 4);
    const stacks = walls.flat();
    expect(stacks).toHaveLength(70);
    expect(stacks.every((s) => s.length === 2)).toBe(true);
    expect(stacks.flat().sort()).toEqual(deck.slice().sort());
  });

  it("벽마다 벽돌 수가 최대한 고르다", () => {
    expect(buildWalls(buildDeck(4), 4).map((w) => w.length)).toEqual([18, 18, 17, 17]);
    expect(buildWalls(buildDeck(3), 3).map((w) => w.length)).toEqual([18, 17, 17]);
    expect(buildWalls(buildDeck(2), 2).map((w) => w.length)).toEqual([25, 25]);
  });

  it("홀수 장은 2단으로 못 쌓는다", () => {
    expect(() => buildWalls(["p1"], 2)).toThrow();
  });
});

describe("주사위와 입구", () => {
  it("주사위 두 개는 항상 2~12", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const { dice, sum } = rollDice(rng);
      expect(dice).toHaveLength(2);
      expect(sum).toBe(dice[0] + dice[1]);
      expect(sum).toBeGreaterThanOrEqual(2);
      expect(sum).toBeLessThanOrEqual(12);
    }
  });

  it("딜러부터 합만큼 세어 벽을 고른다", () => {
    const walls = buildWalls(buildDeck(4), 4);
    expect(chooseOpening(walls, 0, 4).wallIndex).toBe(3); // 딜러=1, 합 4 → 네 번째
    expect(chooseOpening(walls, 1, 4).wallIndex).toBe(0);
    expect(chooseOpening(walls, 0, 8).wallIndex).toBe(3);
  });

  it("입구부터 편 뽑기 순서는 전체 장수 그대로다", () => {
    const deck = buildDeck(4);
    const walls = buildWalls(deck, 4);
    const order = drawOrderFrom(walls, chooseOpening(walls, 0, 7));
    expect(order).toHaveLength(140);
    expect(order.slice().sort()).toEqual(deck.slice().sort());
  });
});

describe("배패", () => {
  for (const playerCount of [2, 3, 4]) {
    it(`${playerCount}인: 손패 16장, 딜러만 17장`, () => {
      const rng = makeRng(7);
      const tiles = shuffleDeck(playerCount, rng);
      const { drawPile } = openWall(tiles, playerCount, 0, rng);
      const { hands, pile } = dealHands(drawPile, playerCount, 1 % playerCount);
      hands.forEach((h, seat) => {
        expect(h).toHaveLength(seat === 1 % playerCount ? 17 : 16);
      });
      const dealt = hands.flat().length;
      expect(dealt + pile.length).toBe(tiles.length);
    });
  }

  it("배패는 벽돌 2개(4장)씩 4바퀴 — 첫 16장은 딜러 몫 4장으로 시작", () => {
    const pile = Array.from({ length: 140 }, (_, i) => `t${i}`);
    const { hands } = dealHands(pile, 4, 0);
    expect(hands[0].slice(0, 4)).toEqual(["t0", "t1", "t2", "t3"]);
    expect(hands[1].slice(0, 4)).toEqual(["t4", "t5", "t6", "t7"]);
    expect(hands[0][16]).toBe("t64"); // 4바퀴(64장) 뒤 딜러가 1장 더
  });
});

describe("꽃 처리", () => {
  it("꽃은 눕히고 담 뒤쪽에서 보충 — 손패 장수는 그대로", () => {
    const hands = [["f1", "f2", "p1"], ["p2", "p3", "p4"]];
    const pile = ["a", "b", "c", "d", "e"];
    const { flowers, events } = resolveFlowers(hands, pile, 0);
    expect(flowers[0]).toEqual(["f1", "f2"]);
    expect(hands[0]).toHaveLength(3);
    expect(hands[0]).toEqual(["p1", "e", "d"]); // 뒤에서 뽑았다
    expect(pile).toEqual(["a", "b", "c"]);
    expect(events).toHaveLength(2);
  });

  it("보충 패가 또 꽃이면 안 나올 때까지 반복한다", () => {
    const hands = [["f1"]];
    const pile = ["x", "p1", "f3"];
    const { flowers } = resolveFlowers(hands, pile, 0);
    expect(flowers[0]).toEqual(["f1", "f3"]);
    expect(hands[0]).toEqual(["p1"]);
  });

  it("실제 배패에서 꽃은 손패에 남지 않는다", () => {
    const rng = makeRng(99);
    const tiles = shuffleDeck(4, rng);
    const { drawPile } = openWall(tiles, 4, 0, rng);
    const { hands, pile } = dealHands(drawPile, 4, 0);
    resolveFlowers(hands, pile, 0);
    expect(hands.flat().some(isFlower)).toBe(false);
  });
});
