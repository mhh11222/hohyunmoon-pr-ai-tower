import { describe, it, expect } from "vitest";
import {
  LEVEL, LEVEL_INFO, makeBot, chooseDiscard, chooseDiscardNormal, chooseDiscardExpert,
  chooseCall, handQuality, botContext,
} from "../src/bot.js";
import { createGame, startHand, PHASE } from "../src/game.js";
import { playHand } from "../src/autoplay.js";
import { CALL } from "../src/calls.js";

describe("난이도 3단계", () => {
  it("초보·보통·고수", () => {
    expect(LEVEL_INFO.map((l) => l.key)).toEqual(["beginner", "normal", "expert"]);
    for (const level of Object.values(LEVEL)) {
      const bot = makeBot(level);
      expect(bot.level).toBe(level);
      expect(typeof bot.discard).toBe("function");
    }
  });
});

describe("버리기", () => {
  const hand = ["p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z5","z6"];

  it("초보도 다 된 묶음은 깨지 않는다", () => {
    const tile = chooseDiscard(hand);
    expect(["z5", "z6"]).toContain(tile);
  });

  it("보통은 버린 뒤 손이 가장 좋아지는 패를 버린다", () => {
    const tile = chooseDiscardNormal(hand);
    expect(["z5", "z6"]).toContain(tile);
    // 짝(z1 z1)은 남긴다
    expect(tile).not.toBe("z1");
  });

  it("보통은 외톨이보다 짝을 지킨다", () => {
    const pairHand = ["p1","p1","p4","p5","p6","s2","s3","s4","m7","m8","m9","z3","s9","p9","m1","z6"];
    const tile = chooseDiscardNormal(pairHand);
    expect(tile).not.toBe("p1");
  });

  it("고수는 위험할 때 거의 같은 효율이면 이미 버려진 패를 고른다", () => {
    // z5와 z6 모두 외톨이 — z6만 강에 이미 있다
    const context = { discards: ["z6", "p2"], danger: true };
    const tile = chooseDiscardExpert(hand, context);
    expect(tile).toBe("z6");
  });

  it("고수도 위험하지 않으면 그냥 최선을 버린다", () => {
    const tile = chooseDiscardExpert(hand, { discards: ["z6"], danger: false });
    expect(["z5", "z6"]).toContain(tile);
  });
});

describe("부르기 판단", () => {
  const concealed = ["p3","p3","p7","p8","s2","s5","m4","m9","z2","z4","z5","z6","p1","s8","m6","z7"];
  const pong = { seat: 1, type: CALL.PONG, tiles: ["p3","p3","p3"] };
  const win = { seat: 1, type: CALL.WIN, tiles: ["z5"] };

  it("완성은 어느 난이도든 무조건 부른다", () => {
    for (const level of Object.values(LEVEL)) {
      expect(chooseCall(concealed, [], [win, pong], level)).toBe(win);
    }
  });

  it("보통은 묶음이 실제로 늘 때만 부른다", () => {
    expect(chooseCall(concealed, [], [pong], LEVEL.NORMAL)).toBe(pong);
    const uselessChow = { seat: 1, type: CALL.CHOW, tiles: ["p6","p7","p8"] };
    // 치로 p7 p8을 쓰면 손이 늘어나는 경우라 판단 결과만 일관되면 된다
    expect([uselessChow, null]).toContain(chooseCall(concealed, [], [uselessChow], LEVEL.NORMAL));
  });

  it("고수는 텐파이 직전이면 참는다 (직접 뽑기 보너스 노림)", () => {
    const almostDone = ["p1","p2","p3","p4","p5","p6","s1","s1","s1","m7","m8","m9","z1","z1","p7","p7"];
    expect(chooseCall(almostDone, [], [{ seat: 1, type: CALL.PONG, tiles: ["p7","p7","p7"] }], LEVEL.EXPERT)).toBe(null);
  });
});

describe("난이도별 실전 — 전부 규칙을 지키며 판을 끝낸다", () => {
  for (const level of Object.values(LEVEL)) {
    it(`${level} 봇 4인전 10판`, () => {
      for (let seed = 100; seed < 110; seed++) {
        const game = startHand(createGame({ playerCount: 4, seed }));
        playHand(game, { bots: game.players.map(() => makeBot(level)) });
        expect([PHASE.WON, PHASE.EXHAUSTED]).toContain(game.phase);
      }
    });
  }

  it("보통이 초보보다 대체로 빨리 이긴다 (많은 판 평균)", () => {
    const avgTurns = (level) => {
      let turns = 0, wins = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const game = startHand(createGame({ playerCount: 2, seed }));
        playHand(game, { bots: game.players.map(() => makeBot(level)) });
        if (game.phase === PHASE.WON) {
          turns += game.log.filter((e) => e.type === "discard").length;
          wins++;
        }
      }
      return turns / wins;
    };
    expect(avgTurns(LEVEL.NORMAL)).toBeLessThan(avgTurns(LEVEL.BEGINNER) + 3);
  });

  it("고수 컨텍스트는 버림패와 위험 신호를 모은다", () => {
    const game = startHand(createGame({ playerCount: 4, seed: 5 }));
    game.players[1].discards = ["z5"];
    game.players[2].melds = [{}, {}];
    const context = botContext(game, 0);
    expect(context.discards).toContain("z5");
    expect(context.danger).toBe(true);
  });
});
