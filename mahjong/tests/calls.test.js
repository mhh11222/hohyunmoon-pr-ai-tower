import { describe, it, expect } from "vitest";
import {
  canPong, canChow, canKong, chowOptions, canWinOnDiscard,
  availableCalls, resolveCalls, leftOf, rightOf, CALL, concealedKongs,
} from "../src/calls.js";

describe("차례 방향 — 내 다음은 오른쪽, 내 왼쪽이 나에게 흘려준다", () => {
  it("4인", () => {
    expect(rightOf(0, 4)).toBe(1);
    expect(leftOf(0, 4)).toBe(3);
  });
  it("2인은 상대가 곧 왼쪽이자 오른쪽", () => {
    expect(leftOf(0, 2)).toBe(1);
    expect(rightOf(0, 2)).toBe(1);
  });
});

describe("펑 — 누구한테서나", () => {
  const hand = ["p3", "p3", "s5", "z1"];
  it("같은 패 2장이면 펑", () => expect(canPong(hand, "p3")).toBe(true));
  it("1장뿐이면 못 한다", () => expect(canPong(hand, "s5")).toBe(false));
  it("멀리 있는 사람이 버려도 펑할 수 있다", () => {
    const calls = availableCalls(
      [{ seat: 0, concealed: hand, melds: [] }, { seat: 2, concealed: [], melds: [] }],
      "p3", 2
    );
    expect(calls.some((c) => c.seat === 0 && c.type === CALL.PONG)).toBe(true);
  });
});

describe("치 — 내 바로 왼쪽 사람이 버린 것만", () => {
  const hand = ["p3", "p4", "s5", "s7"];
  it("조각이 있으면 조합을 찾는다", () => {
    expect(chowOptions(hand, "p2")).toEqual([["p3", "p4"]]);
    expect(chowOptions(hand, "p5")).toEqual([["p3", "p4"]]);
    expect(chowOptions(hand, "s6")).toEqual([["s5", "s7"]]);
  });
  it("글자패는 계단이 없다", () => expect(chowOptions(["z1", "z2"], "z3")).toEqual([]));
  it("왼쪽 사람이면 되고 다른 사람이면 안 된다", () => {
    expect(canChow(hand, "p2", { seat: 0, from: 3, playerCount: 4 })).toBe(true);
    expect(canChow(hand, "p2", { seat: 0, from: 1, playerCount: 4 })).toBe(false);
    expect(canChow(hand, "p2", { seat: 0, from: 2, playerCount: 4 })).toBe(false);
  });
  it("2인에서는 상대가 왼쪽이라 치가 된다", () => {
    expect(canChow(hand, "p2", { seat: 0, from: 1, playerCount: 2 })).toBe(true);
  });
});

describe("깡", () => {
  it("손에 3장이면 버려진 패로 깡", () => expect(canKong(["p1","p1","p1"], "p1")).toBe(true));
  it("손 안 4장은 안깡", () => expect(concealedKongs(["p1","p1","p1","p1","s2"])).toEqual(["p1"]));
  it("옵션이 꺼져 있으면 깡은 후보에 없다", () => {
    const players = [{ seat: 0, concealed: ["p1","p1","p1"], melds: [] }, { seat: 1, concealed: [], melds: [] }];
    expect(availableCalls(players, "p1", 1).some((c) => c.type === CALL.KONG)).toBe(false);
    expect(availableCalls(players, "p1", 1, { allowKong: true }).some((c) => c.type === CALL.KONG)).toBe(true);
  });
});

describe("완성 — 짝은 남의 패로도 받을 수 있다", () => {
  const concealed = ["p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z1","z5"];
  it("마지막 짝 패가 버려지면 완성", () => {
    expect(canWinOnDiscard(concealed, "z5")).toBe(true);
    expect(canWinOnDiscard(concealed, "z6")).toBe(false);
  });
  it("버린 사람 본인은 부를 수 없다", () => {
    const calls = availableCalls([{ seat: 0, concealed, melds: [] }], "z5", 0);
    expect(calls).toEqual([]);
  });
});

describe("우선순위 — 완성 > 펑·깡 > 치", () => {
  const claims = [
    { seat: 1, type: CALL.CHOW, tiles: ["p1","p2","p3"] },
    { seat: 2, type: CALL.PONG, tiles: ["p3","p3","p3"] },
    { seat: 3, type: CALL.WIN, tiles: ["p3"] },
  ];
  it("완성이 제일 세다", () => expect(resolveCalls(claims, 0, 4).seat).toBe(3));
  it("펑이 치보다 세다", () => expect(resolveCalls(claims.slice(0, 2), 0, 4).type).toBe(CALL.PONG));
  it("같은 등급이면 버린 사람 기준 차례가 가까운 쪽", () => {
    const two = [
      { seat: 3, type: CALL.WIN, tiles: ["p3"] },
      { seat: 1, type: CALL.WIN, tiles: ["p3"] },
    ];
    expect(resolveCalls(two, 0, 4).seat).toBe(1);
  });
  it("아무도 안 부르면 null", () => expect(resolveCalls([], 0, 4)).toBe(null));
});
