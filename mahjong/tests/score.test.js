import { describe, it, expect } from "vitest";
import { countBonuses, handValue, payments, scoreWin, DEFAULT_OPTIONS } from "../src/score.js";

// 완성 손패 하나를 분해 형태로 만들어 주는 헬퍼
const set = (type, ...tiles) => ({ type, tiles });
const plainHand = {
  sets: [
    set("run", "p1", "p2", "p3"),
    set("run", "p4", "p5", "p6"),
    set("run", "s1", "s2", "s3"),
    set("run", "s4", "s5", "s6"),
    set("run", "m1", "m2", "m3"),
  ],
  pair: ["m9", "m9"],
};

const base = {
  seat: "east", melds: [], decomposition: plainHand, flowers: [],
  isSelfDraw: false, options: DEFAULT_OPTIONS,
};

describe("기본 보너스 4가지", () => {
  it("아무것도 없으면 보너스 0 → 10점", () => {
    const hand = { ...base, melds: [{ type: "chow", tiles: ["p1","p2","p3"] }] };
    const { total } = countBonuses(hand);
    expect(total).toBe(0);
    expect(handValue(total)).toBe(10);
  });

  it("안 부르고 이기면 +1", () => {
    expect(countBonuses(base).total).toBe(1);
  });

  it("직접 뽑아 이기면 +1 (부른 손일 때)", () => {
    const called = { ...base, melds: [{ type: "pong", tiles: ["p1","p1","p1"] }], isSelfDraw: true };
    const { bonuses, total } = countBonuses(called);
    expect(total).toBe(1);
    expect(bonuses[0].key).toBe("selfDraw");
  });

  it("특칙: 안 부르고 + 직접 뽑아 = 2가 아니라 3", () => {
    const { bonuses, total } = countBonuses({ ...base, isSelfDraw: true });
    expect(total).toBe(3);
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].key).toBe("concealedSelfDraw");
  });

  it("내 자리 꽃이면 +1, 남의 꽃은 안 센다", () => {
    expect(countBonuses({ ...base, flowers: ["f1"] }).total).toBe(2); // 동=春
    expect(countBonuses({ ...base, flowers: ["f2"] }).total).toBe(1);
    expect(countBonuses({ ...base, seat: "south", flowers: ["f2"] }).total).toBe(2);
  });

  it("中發白 세쌍둥이는 하나당 +1", () => {
    const dragons = {
      ...base,
      melds: [{ type: "pong", tiles: ["z5","z5","z5"] }],
      decomposition: {
        sets: [set("triplet","z6","z6","z6"), set("run","p1","p2","p3"),
               set("run","p4","p5","p6"), set("run","s1","s2","s3")],
        pair: ["m9","m9"],
      },
    };
    // 펑을 했으니 '안 부르고'는 없고, 삼원 세쌍둥이 2개만
    expect(countBonuses(dragons).total).toBe(2);
  });

  it("안깡은 '부른' 것이 아니다", () => {
    const kong = { ...base, melds: [{ type: "concealed-kong", tiles: ["p9","p9","p9","p9"] }] };
    expect(countBonuses(kong).bonuses.some((b) => b.key === "concealed")).toBe(true);
  });
});

describe("점수 공식", () => {
  it("기본 10/10 → (보너스+1)×10", () => {
    expect(handValue(0)).toBe(10);
    expect(handValue(3)).toBe(40);
  });
  it("기본점·보너스점은 조정 가능 (30/10, 10/20)", () => {
    expect(handValue(2, { basePoint: 30, bonusPoint: 10 })).toBe(50);
    expect(handValue(2, { basePoint: 10, bonusPoint: 20 })).toBe(50);
  });
});

describe("누가 내나", () => {
  it("남이 버린 패로 완성 → 그 사람 혼자 전액", () => {
    const pay = payments({ winner: 0, discarder: 2, playerCount: 4, value: 40, isSelfDraw: false });
    expect(pay).toEqual([{ from: 2, to: 0, amount: 40 }]);
  });

  it("직접 뽑아 완성 → 나머지 전원이 각각 전액", () => {
    const pay = payments({ winner: 0, playerCount: 4, value: 40, isSelfDraw: true });
    expect(pay).toHaveLength(3);
    expect(pay.every((p) => p.amount === 40)).toBe(true);
  });

  it("2인 특칙: 직접 뽑으면 상대가 2배", () => {
    const pay = payments({ winner: 0, playerCount: 2, value: 40, isSelfDraw: true });
    expect(pay).toEqual([{ from: 1, to: 0, amount: 80 }]);
  });

  it("2인이라도 쏘고 맞으면 1배", () => {
    const pay = payments({ winner: 0, discarder: 1, playerCount: 2, value: 40, isSelfDraw: false });
    expect(pay).toEqual([{ from: 1, to: 0, amount: 40 }]);
  });
});

describe("확장 보너스 (토글)", () => {
  const ext = { ...DEFAULT_OPTIONS, extendedBonuses: true };

  const honorsHand = {
    seat: "east", melds: [], flowers: [], isSelfDraw: false, options: ext,
    decomposition: {
      sets: [set("triplet","z1","z1","z1"), set("triplet","z2","z2","z2"),
             set("triplet","z3","z3","z3"), set("triplet","z4","z4","z4"),
             set("triplet","z5","z5","z5")],
      pair: ["z6","z6"],
    },
  };

  it("꺼져 있으면 확장 보너스를 세지 않는다", () => {
    const off = countBonuses({ ...honorsHand, options: DEFAULT_OPTIONS });
    expect(off.bonuses.some((b) => b.key === "allHonors")).toBe(false);
  });

  it("字一色 + 大四喜는 합산되고, 門風·碰碰胡는 포함되어 안 센다", () => {
    const { bonuses } = countBonuses(honorsHand);
    const keys = bonuses.map((b) => b.key);
    expect(keys).toContain("allHonors");   // 16
    expect(keys).toContain("bigWinds");    // 16
    expect(keys).not.toContain("seatWind");    // 大四喜에 포함
    expect(keys).not.toContain("allTriplets"); // 字一色에 포함
  });

  it("清一色이면 混一色은 안 센다", () => {
    const pure = {
      seat: "east", melds: [], flowers: [], isSelfDraw: false, options: ext,
      decomposition: {
        sets: [set("run","p1","p2","p3"), set("run","p2","p3","p4"), set("run","p4","p5","p6"),
               set("run","p5","p6","p7"), set("run","p7","p8","p9")],
        pair: ["p9","p9"],
      },
    };
    const keys = countBonuses(pure).bonuses.map((b) => b.key);
    expect(keys).toContain("pureSuit");
    expect(keys).not.toContain("mixedSuit");
  });

  it("混一色은 한 무늬 + 글자패", () => {
    const mixed = {
      seat: "east", melds: [], flowers: [], isSelfDraw: false, options: ext,
      decomposition: {
        sets: [set("run","s1","s2","s3"), set("run","s4","s5","s6"), set("run","s7","s8","s9"),
               set("triplet","z1","z1","z1"), set("triplet","z5","z5","z5")],
        pair: ["z6","z6"],
      },
    };
    const keys = countBonuses(mixed).bonuses.map((b) => b.key);
    expect(keys).toContain("mixedSuit");
    expect(keys).not.toContain("pureSuit");
  });

  it("大三元이면 小三元·개별 삼원 세쌍둥이는 안 센다", () => {
    const big = {
      seat: "east", melds: [], flowers: [], isSelfDraw: false, options: ext,
      decomposition: {
        sets: [set("triplet","z5","z5","z5"), set("triplet","z6","z6","z6"),
               set("triplet","z7","z7","z7"), set("run","p1","p2","p3"), set("run","p4","p5","p6")],
        pair: ["p9","p9"],
      },
    };
    const { bonuses } = countBonuses(big);
    const keys = bonuses.map((b) => b.key);
    expect(keys).toContain("bigDragons");
    expect(keys).not.toContain("dragonTriplet");
    expect(keys).not.toContain("smallDragons");
  });

  it("小三元은 둘 세쌍둥이 + 하나 짝", () => {
    const small = {
      seat: "east", melds: [], flowers: [], isSelfDraw: false, options: ext,
      decomposition: {
        sets: [set("triplet","z5","z5","z5"), set("triplet","z6","z6","z6"),
               set("run","p1","p2","p3"), set("run","p4","p5","p6"), set("run","p7","p8","p9")],
        pair: ["z7","z7"],
      },
    };
    const keys = countBonuses(small).bonuses.map((b) => b.key);
    expect(keys).toContain("smallDragons");
    expect(keys).not.toContain("dragonTriplet");
  });

  it("碰碰胡는 묶음 5개가 전부 세쌍둥이", () => {
    const pungs = {
      seat: "south", melds: [], flowers: [], isSelfDraw: false, options: ext,
      decomposition: {
        sets: [set("triplet","p1","p1","p1"), set("triplet","p5","p5","p5"),
               set("triplet","s3","s3","s3"), set("triplet","m7","m7","m7"),
               set("triplet","z2","z2","z2")],
        pair: ["z6","z6"],
      },
    };
    const keys = countBonuses(pungs).bonuses.map((b) => b.key);
    expect(keys).toContain("allTriplets");
    expect(keys).toContain("seatWind"); // 남 자리에 南 세쌍둥이
  });
});

describe("scoreWin — 보너스·점수·지불을 한 번에", () => {
  it("직접 뽑고 안 부른 4인 판", () => {
    const r = scoreWin({
      ...base, isSelfDraw: true, winnerIndex: 1, discarderIndex: null, playerCount: 4,
    });
    expect(r.bonusTotal).toBe(3);
    expect(r.value).toBe(40);
    expect(r.payments).toHaveLength(3);
  });
});
