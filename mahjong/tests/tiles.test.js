import { describe, it, expect } from "vitest";
import {
  allTileIds, copiesOf, sortTiles, tileName, tileOrder,
  SEAT_FLOWER, SEAT_WIND, FLOWERS, DRAGONS, isTerminal, isHonor,
} from "../src/tiles.js";
import { buildDeck, DECK_SIZE, excludedSuits } from "../src/deck.js";

describe("내 세트 스펙 — 패 구성", () => {
  it("종류는 통·삭·만 27종 + 글자 7종 + 꽃 4종", () => {
    expect(allTileIds()).toHaveLength(27 + 7 + 4);
  });

  it("꽃은 사계절 4장뿐, 각 1장 (매란국죽 없음)", () => {
    expect(FLOWERS).toEqual(["f1", "f2", "f3", "f4"]);
    for (const f of FLOWERS) expect(copiesOf(f)).toBe(1);
  });

  it("꽃 말고는 전부 4장", () => {
    for (const id of allTileIds()) {
      if (!FLOWERS.includes(id)) expect(copiesOf(id)).toBe(4);
    }
  });

  it("4인 140장 / 3인 104장(만자 제외) / 2인 100장(만자·꽃 제외)", () => {
    expect(buildDeck(4)).toHaveLength(140);
    expect(buildDeck(3)).toHaveLength(104);
    expect(buildDeck(2)).toHaveLength(100);
    expect(DECK_SIZE).toEqual({ 2: 100, 3: 104, 4: 140 });
    expect(excludedSuits(3)).toEqual(["m"]);
    expect(excludedSuits(2)).toEqual(["m", "f"]);
  });

  it("3인 덱에 만자가 없고, 2인 덱엔 꽃도 없다", () => {
    expect(buildDeck(3).some((t) => t.startsWith("m"))).toBe(false);
    expect(buildDeck(3).filter((t) => t.startsWith("f"))).toHaveLength(4);
    expect(buildDeck(2).some((t) => t.startsWith("f"))).toBe(false);
  });

  it("2·3·4인 말고는 거부", () => {
    expect(() => buildDeck(5)).toThrow();
    expect(() => buildDeck(1)).toThrow();
  });
});

describe("표기와 정렬", () => {
  it("만자 5는 '伍', 백은 白, 1삭·8삭도 이름이 있다", () => {
    expect(tileName("m5")).toBe("伍萬");
    expect(tileName("z7")).toBe("白");
    expect(tileName("s1")).toBe("1삭");
    expect(tileName("s8")).toBe("8삭");
    expect(tileName("p1")).toBe("1통");
    expect(tileName("f1")).toBe("春");
  });

  it("정렬은 통→삭→만→바람→삼원 순", () => {
    const mixed = ["z5", "f1", "m1", "z1", "s3", "p2"];
    expect(sortTiles(mixed)).toEqual(["p2", "s3", "m1", "z1", "z5", "f1"]);
    expect(tileOrder("p1")).toBeLessThan(tileOrder("s1"));
    expect(tileOrder("s1")).toBeLessThan(tileOrder("m1"));
    expect(tileOrder("m9")).toBeLessThan(tileOrder("z1"));
  });

  it("자리별 정화: 동春 남夏 서秋 북冬, 자리 바람은 東南西北", () => {
    expect(SEAT_FLOWER).toEqual({ east: "f1", south: "f2", west: "f3", north: "f4" });
    expect(SEAT_WIND).toEqual({ east: "z1", south: "z2", west: "z3", north: "z4" });
  });

  it("삼원은 中發白 셋, 끝수는 1·9만", () => {
    expect(DRAGONS).toHaveLength(3);
    expect(isTerminal("p1")).toBe(true);
    expect(isTerminal("s9")).toBe(true);
    expect(isTerminal("p5")).toBe(false);
    expect(isTerminal("z1")).toBe(false); // 글자패는 끝수가 아니다
    expect(isHonor("z7")).toBe(true);
  });
});
