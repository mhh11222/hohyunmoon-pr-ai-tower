import { describe, it, expect } from "vitest";
import { RULE_CARDS, cardHTML } from "../ui/rulecards.js";
import { allTileIds } from "../src/tiles.js";

describe("기본 룰 카드", () => {
  it("여섯 장이고 저마다 제목·설명·연상 고리가 있다", () => {
    expect(RULE_CARDS).toHaveLength(6);
    for (const card of RULE_CARDS) {
      expect(card.title).toBeTruthy();
      expect(card.body).toBeTruthy();
      expect(card.tip).toBeTruthy();
      expect(card.rows.length).toBeGreaterThan(0);
    }
  });

  it("카드에 쓰인 패는 전부 이 세트에 있는 패다", () => {
    const known = new Set(allTileIds());
    for (const card of RULE_CARDS) {
      for (const row of card.rows) {
        for (const tile of row.tiles) expect(known.has(tile)).toBe(true);
      }
    }
  });

  it("첫 카드는 완성형(묶음 5 + 짝 1)을 그대로 보여 준다", () => {
    const [goal] = RULE_CARDS;
    const sets = goal.rows.filter((r) => r.tiles.length === 3);
    const pair = goal.rows.filter((r) => r.tiles.length === 2);
    expect(sets).toHaveLength(5);
    expect(pair).toHaveLength(1);
    expect(sets.flatMap((r) => r.tiles).length + pair[0].tiles.length).toBe(17);
  });

  it("계단 예시는 같은 무늬 연속, 세쌍둥이 예시는 똑같은 3장", () => {
    const sets = RULE_CARDS.find((c) => c.key === "sets");
    const [run, triplet] = sets.rows;
    expect(new Set(run.tiles.map((t) => t[0])).size).toBe(1);
    expect(run.tiles.map((t) => Number(t.slice(1)))).toEqual([3, 4, 5]);
    expect(new Set(triplet.tiles).size).toBe(1);
  });

  it("카드 HTML에 진행 표시와 점이 들어간다", () => {
    const html = cardHTML(RULE_CARDS[2], 2, RULE_CARDS.length);
    expect(html).toContain("3 / 6");
    expect(html).toContain(RULE_CARDS[2].title);
    expect((html.match(/class="dot(?:"| on")/g) || [])).toHaveLength(6);
    expect(html).toContain('class="dot on"');
  });

  it("모든 카드가 오류 없이 그려진다", () => {
    RULE_CARDS.forEach((card, i) => {
      expect(cardHTML(card, i, RULE_CARDS.length)).toContain("rulecard");
    });
  });
});
