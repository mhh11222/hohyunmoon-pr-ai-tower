import { describe, it, expect } from "vitest";
import {
  createGame, startHand, nextHand, draw, discard, resolveDiscard, declareWin,
  actionsFor, waitsFor, PHASE,
} from "../src/game.js";
import { playHand } from "../src/autoplay.js";
import { DECK_SIZE } from "../src/deck.js";
import { purseValue, TOTAL_VALUE } from "../src/sticks.js";
import { CALL } from "../src/calls.js";

/** 판 위의 모든 패를 센다 — 한 장도 새거나 늘면 안 된다 */
function tilesInPlay(game) {
  let n = game.pile.length;
  for (const p of game.players) {
    n += p.concealed.length + p.flowers.length + p.discards.length;
    n += p.melds.reduce((s, m) => s + m.tiles.length, 0);
  }
  if (game.pending) n += 0; // 버려진 패는 아직 버림패 더미에 있다
  if (game.phase === PHASE.WON && !game.result.isSelfDraw) n += 1; // 부른 완성패
  return n;
}

/** target 과 겹치지 않는 아무 패 n장 — 부르기 테스트용 채움패 */
function filler(target, n) {
  const pool = [];
  for (const suit of ["p", "s", "m"]) for (let r = 1; r <= 9; r++) pool.push(`${suit}${r}`);
  return pool.filter((t) => t !== target).slice(0, n);
}

function bankTotal(game) {
  return game.bank.players.reduce((s, p) => s + purseValue(p), 0) + purseValue(game.bank.pot);
}

describe("판 세팅", () => {
  for (const playerCount of [2, 3, 4]) {
    it(`${playerCount}인 배패 직후: 손패 16 / 딜러 17, 패 총합 ${DECK_SIZE[playerCount]}`, () => {
      const game = startHand(createGame({ playerCount, seed: 5 }));
      game.players.forEach((p, seat) => {
        expect(p.concealed).toHaveLength(seat === game.dealerIndex ? 17 : 16);
        expect(p.concealed.some((t) => t.startsWith("f"))).toBe(false); // 꽃은 눕혔다
      });
      expect(tilesInPlay(game)).toBe(DECK_SIZE[playerCount]);
      expect(game.phase).toBe(PHASE.DISCARD); // 딜러가 첫 패를 버리며 시작
      expect(game.turn).toBe(game.dealerIndex);
    });
  }

  it("2인 판에는 꽃이 아예 없다", () => {
    const game = startHand(createGame({ playerCount: 2, seed: 3 }));
    expect(game.players.every((p) => p.flowers.length === 0)).toBe(true);
  });

  it("2·3·4인만 만들 수 있다", () => {
    expect(() => createGame({ playerCount: 5 })).toThrow();
  });

  it("같은 시드면 같은 판이 나온다", () => {
    const a = startHand(createGame({ playerCount: 4, seed: 12345 }));
    const b = startHand(createGame({ playerCount: 4, seed: 12345 }));
    expect(a.players[0].concealed).toEqual(b.players[0].concealed);
  });
});

describe("한 턴 리듬 — 뽑고 → 버리고", () => {
  it("버릴 차례에 뽑을 수 없고, 뽑을 차례에 버릴 수 없다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 11 }));
    expect(() => draw(game)).toThrow();
    discard(game, game.players[game.turn].concealed[0]);
    if (game.phase === PHASE.DRAW) {
      expect(() => discard(game, game.players[game.turn].concealed[0])).toThrow();
    }
  });

  it("손에 없는 패는 못 버린다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 11 }));
    const notInHand = ["p1","p2","p3","p4","p5","p6","p7","p8","p9"]
      .find((t) => !game.players[game.turn].concealed.includes(t));
    expect(() => discard(game, notInHand)).toThrow();
  });

  it("아무도 안 부르면 차례는 오른쪽으로 넘어간다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 202 }));
    const dealer = game.turn;
    // 부를 수 없는 패가 나올 때까지 버려 본다
    discard(game, game.players[dealer].concealed[0]);
    if (game.phase === PHASE.CALLS) resolveDiscard(game, []); // 전원 패스
    expect(game.turn).toBe((dealer + 1) % 4);
    expect(game.phase).toBe(PHASE.DRAW);
  });

  it("버린 패는 버림패 더미에 쌓이고 되돌릴 수 없다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 77 }));
    const seat = game.turn;
    const tile = game.players[seat].concealed[0];
    discard(game, tile);
    if (game.phase === PHASE.CALLS) resolveDiscard(game, []);
    expect(game.players[seat].discards).toContain(tile);
    expect(game.players[seat].concealed).not.toContain(tile);
  });
});

describe("부르기", () => {
  it("펑하면 묶음이 공개·잠기고, 뽑기 없이 바로 버릴 차례가 된다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 4242 }));
    // 2번 자리 손에 억지로 펑거리를 만들어 준다
    const target = game.players[game.turn].concealed[0];
    game.players[2].concealed = [...filler(target, 14), target, target];
    const from = game.turn;
    discard(game, target);
    expect(game.phase).toBe(PHASE.CALLS);
    const claim = game.pending.calls.find((c) => c.seat === 2 && c.type === CALL.PONG);
    expect(claim).toBeTruthy();
    resolveDiscard(game, [claim]);
    expect(game.players[2].melds[0]).toMatchObject({ type: CALL.PONG, locked: true, from });
    expect(game.players[from].discards).not.toContain(target); // 방금 그 한 장을 가져갔다
    expect(game.turn).toBe(2);
    expect(game.phase).toBe(PHASE.DISCARD);
    expect(tilesInPlay(game)).toBe(140);
  });

  it("공개한 묶음의 패는 버릴 수 없다 (잠금)", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 4242 }));
    const target = game.players[game.turn].concealed[0];
    game.players[2].concealed = [...filler(target, 14), target, target];
    discard(game, target);
    resolveDiscard(game, [game.pending.calls.find((c) => c.seat === 2 && c.type === CALL.PONG)]);
    expect(actionsFor(game, 2)[0].tiles).not.toContain(target);
    expect(() => discard(game, target)).toThrow();
  });

  it("가짜 부르기는 무시된다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 909 }));
    const tile = game.players[game.turn].concealed[0];
    const from = game.turn;
    discard(game, tile);
    if (game.phase === PHASE.CALLS) {
      resolveDiscard(game, [{ seat: (from + 2) % 4, type: CALL.PONG, tiles: [tile, tile, tile] }]);
      expect(game.players[(from + 2) % 4].melds).toHaveLength(0);
    }
  });
});

describe("완성과 정산", () => {
  it("완성형이 아니면 완성 선언을 거부한다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 31 }));
    game.players[0].concealed = ["p1","p3","p5","p7","p9","s1","s3","s5","s7","s9","m1","m3","m5","m7","m9","z1","z3"];
    expect(() => declareWin(game, 0)).toThrow();
  });

  it("직접 뽑아 이기면 나머지 전원이 낸다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 31 }));
    game.players[0].concealed = [
      "p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z1","z5","z5",
    ];
    game.players[0].melds = [];
    game.players[0].flowers = []; // 꽃 보너스를 빼고 순수하게 센다
    game.turn = 0;
    game.phase = PHASE.DISCARD;
    declareWin(game, 0);
    expect(game.phase).toBe(PHASE.WON);
    expect(game.result.isSelfDraw).toBe(true);
    expect(game.result.bonusTotal).toBe(3); // 안 부르고 + 직접 뽑아
    expect(game.result.value).toBe(40);
    expect(game.result.payments).toHaveLength(3);
    expect(bankTotal(game)).toBe(TOTAL_VALUE);
    expect(game.result.totals[0].delta).toBe(120);
  });

  it("남이 버린 패로 이기면 그 사람 혼자 낸다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 31 }));
    game.players[1].concealed = [
      "p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z1","z5",
    ];
    game.players[0].concealed = ["z5", ...game.players[0].concealed.slice(0, 16)];
    game.turn = 0;
    game.phase = PHASE.DISCARD;
    discard(game, "z5");
    const win = game.pending.calls.find((c) => c.seat === 1 && c.type === CALL.WIN);
    expect(win).toBeTruthy();
    resolveDiscard(game, [win]);
    expect(game.result.winner).toBe(1);
    expect(game.result.discarder).toBe(0);
    expect(game.result.payments).toEqual([{ from: 0, to: 1, amount: expect.any(Number) }]);
    expect(bankTotal(game)).toBe(TOTAL_VALUE);
  });

  it("딜러가 이기면 유지, 남이 이기면 오른쪽으로 넘어간다", () => {
    const game = createGame({ playerCount: 4, seed: 8 });
    startHand(game);
    game.result = { winner: game.dealerIndex };
    nextHand(game);
    expect(game.dealerIndex).toBe(0);
    game.result = { winner: 2 };
    nextHand(game);
    expect(game.dealerIndex).toBe(1);
  });
});

describe("봇끼리 끝까지 — 규칙 위반 없이 판이 닫힌다", () => {
  for (const playerCount of [2, 3, 4]) {
    it(`${playerCount}인 판 여러 개를 돌려도 패·산가지가 보존된다`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const game = startHand(createGame({ playerCount, seed, options: { extendedBonuses: true } }));
        playHand(game);
        expect([PHASE.WON, PHASE.EXHAUSTED]).toContain(game.phase);
        expect(tilesInPlay(game)).toBe(DECK_SIZE[playerCount]);
        expect(bankTotal(game)).toBe(TOTAL_VALUE);
        if (game.phase === PHASE.WON) {
          const r = game.result;
          expect(r.decomposition.sets.length + r.melds.length).toBe(5);
          expect(r.decomposition.pair).toHaveLength(2);
          expect(r.value).toBeGreaterThanOrEqual(10);
          const paid = r.payments.reduce((s, p) => s + p.amount, 0);
          expect(r.totals[r.winner].delta).toBe(paid);
        }
      }
    });
  }

  it("한 바퀴(연속 여러 판)를 돌려도 손익 합계는 0", () => {
    const game = createGame({ playerCount: 4, seed: 2026 });
    startHand(game);
    for (let h = 0; h < 6; h++) {
      playHand(game);
      if (h < 5) nextHand(game);
    }
    const rows = game.result.totals;
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(0);
    expect(bankTotal(game)).toBe(TOTAL_VALUE);
  });
});

describe("학습 모드 훅", () => {
  it("텐파이면 대기패를 알려준다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 31 }));
    game.players[0].concealed = [
      "p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z1","z5",
    ];
    game.players[0].melds = [];
    expect(waitsFor(game, 0)).toEqual(["z5"]);
  });

  it("내 차례가 아니면 할 수 있는 게 없다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 31 }));
    const notTurn = (game.turn + 1) % 4;
    expect(actionsFor(game, notTurn)).toEqual([]);
  });
});

describe("한 수 물리기 (학습 모드)", () => {
  it("버리기 전으로 정확히 돌아간다", async () => {
    const { snapshotGame, restoreGame } = await import("../src/game.js");
    const game = startHand(createGame({ playerCount: 4, seed: 55 }));
    const snap = snapshotGame(game);
    const seat = game.turn;
    const tile = game.players[seat].concealed[0];

    discard(game, tile);
    if (game.phase === PHASE.CALLS) resolveDiscard(game, []);
    expect(game.players[seat].concealed).not.toContain(tile);

    restoreGame(game, snap);
    expect(game.players[seat].concealed).toContain(tile);
    expect(game.players[seat].discards).toHaveLength(0);
    expect(game.turn).toBe(seat);
    expect(game.phase).toBe(PHASE.DISCARD);
    expect(tilesInPlay(game)).toBe(DECK_SIZE[4]);
  });

  it("스냅샷은 원본과 따로 논다 (얕은 복사가 아니다)", async () => {
    const { snapshotGame } = await import("../src/game.js");
    const game = startHand(createGame({ playerCount: 2, seed: 5 }));
    const snap = snapshotGame(game);
    const before = snap.players[0].concealed.length;
    game.players[0].concealed.push("p1");
    game.bank.players[0][10] = 99;
    expect(snap.players[0].concealed).toHaveLength(before);
    expect(snap.bank.players[0][10]).not.toBe(99);
  });

  it("되돌린 뒤 산가지도 원래대로", async () => {
    const { snapshotGame, restoreGame } = await import("../src/game.js");
    const game = startHand(createGame({ playerCount: 2, seed: 9 }));
    const snap = snapshotGame(game);
    game.players[0].concealed = [
      "p1","p2","p3","p4","p5","p6","s1","s1","s1","s4","s5","s6","z1","z1","z1","z5","z5",
    ];
    game.turn = 0; game.phase = PHASE.DISCARD;
    declareWin(game, 0);
    expect(bankTotal(game)).toBe(TOTAL_VALUE);
    restoreGame(game, snap);
    expect(game.bank.players[0][10]).toBe(10);
    expect(game.phase).toBe(PHASE.DISCARD);
    expect(game.result).toBe(null);
  });
});
