import { describe, it, expect } from "vitest";
import { formatMoney, exchangeSheetHTML } from "../ui/view.js";
import { createGame, startHand, declareWin, PHASE } from "../src/game.js";
import { CATS } from "../ui/cats.js";

describe("돈 표기", () => {
  it("천 단위 쉼표와 부호", () => {
    expect(formatMoney(1200)).toBe("+1,200원");
    expect(formatMoney(-300)).toBe("-300원");
    expect(formatMoney(0)).toBe("0원");
  });
});

describe("환전 화면", () => {
  function wonGame() {
    const game = startHand(createGame({ playerCount: 2, seed: 9 }));
    game.players[0].concealed = [
      "p1","p2","p3","p4","p5","p6","s1","s1","s1","s4","s5","s6","z1","z1","z1","z5","z5",
    ];
    game.players[0].melds = [];
    game.turn = 0;
    game.phase = PHASE.DISCARD;
    declareWin(game, 0); // 안 부르고 + 직접 뽑아 = 보너스 3 → 40점, 2인 특칙 2배 = 80점
    return game;
  }

  it("손익을 환율대로 돈으로 바꾼다 (2인 직접뽑기 2배 포함)", () => {
    const game = wonGame();
    const html = exchangeSheetHTML(game, [null, CATS.podo], 0, 100);
    expect(html).toContain("10점 = 100원");
    expect(html).toContain("+80점");
    expect(html).toContain("+800원");
    expect(html).toContain("-800원");
    expect(html).toContain("포도");
    expect(html).toContain("나");
  });

  it("환율을 바꾸면 금액이 따라간다", () => {
    const game = wonGame();
    expect(exchangeSheetHTML(game, [null, CATS.podo], 0, 1000)).toContain("+8,000원");
    expect(exchangeSheetHTML(game, [null, CATS.podo], 0, 10)).toContain("+80원");
  });

  it("실제 결제가 아니라는 안내가 있다", () => {
    const html = exchangeSheetHTML(wonGame(), [null, CATS.podo], 0, 100);
    expect(html).toContain("실제 결제가 아닙니다");
  });
});
