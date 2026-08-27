import { describe, it, expect } from "vitest";
import {
  decompose, isWinningHand, waitingTiles, isTenpai, countReadySets, SETS_TO_WIN,
} from "../src/hand.js";

const WIN17 = [
  "p1","p2","p3", "p4","p5","p6", "s1","s1","s1", "m9","m9","m9", "z1","z1","z1", "z5","z5",
];

describe("완성형 — 묶음 5개 + 짝 1개 = 17장", () => {
  it("묶음 5 + 짝 1이면 완성", () => {
    expect(SETS_TO_WIN).toBe(5);
    expect(isWinningHand(WIN17)).toBe(true);
    const d = decompose(WIN17);
    expect(d.sets).toHaveLength(5);
    expect(d.pair).toEqual(["z5", "z5"]);
  });

  it("16장(짝 한 장 모자람)은 완성이 아니다", () => {
    expect(isWinningHand(WIN17.slice(0, 16))).toBe(false);
  });

  it("짝이 둘이면 완성이 아니다 — 짝은 딱 하나", () => {
    const twoPairs = ["p1","p1", "p2","p2", "p3","p3","p3", "s4","s5","s6",
                      "s7","s8","s9", "m1","m1","m1", "z1"];
    expect(isWinningHand(twoPairs)).toBe(false);
  });

  it("글자패는 계단이 안 된다", () => {
    const honorRun = ["z1","z2","z3", "p1","p2","p3", "p4","p5","p6",
                      "s1","s2","s3", "s4","s5","s6", "z5","z5"];
    expect(isWinningHand(honorRun)).toBe(false);
  });

  it("9→1로 이어지는 계단은 없다", () => {
    const wrap = ["p8","p9","p1", "p2","p3","p4", "s1","s2","s3",
                  "s4","s5","s6", "m1","m1","m1", "z5","z5"];
    expect(isWinningHand(wrap)).toBe(false);
  });

  it("무늬를 건너뛴 계단도 안 된다", () => {
    const mixed = ["p1","s2","m3", "p4","p5","p6", "s4","s5","s6",
                   "m4","m5","m6", "z1","z1","z1", "z5","z5"];
    expect(isWinningHand(mixed)).toBe(false);
  });

  it("공개한 묶음이 있으면 손 안은 그만큼 짧아진다", () => {
    const concealed = ["p1","p2","p3", "s1","s1","s1", "z5","z5"]; // 묶음 2 + 짝
    expect(isWinningHand(concealed, 3)).toBe(true);
    expect(isWinningHand(concealed, 2)).toBe(false); // 장수가 안 맞는다
  });

  it("세쌍둥이만 5개 + 짝도 완성", () => {
    const pungs = ["p1","p1","p1", "p5","p5","p5", "s3","s3","s3",
                   "m7","m7","m7", "z2","z2","z2", "z6","z6"];
    expect(isWinningHand(pungs)).toBe(true);
  });
});

describe("대기패 — '○○ 오면 완성'", () => {
  it("짝만 모자라면 그 패 하나를 기다린다", () => {
    expect(waitingTiles(WIN17.slice(0, 16))).toEqual(["z5"]);
    expect(isTenpai(WIN17.slice(0, 16))).toBe(true);
  });

  it("양쪽 대기는 두 장을 기다린다", () => {
    const hand = ["p2","p3", "p4","p5","p6", "s1","s1","s1",
                  "m9","m9","m9", "z1","z1","z1", "z5","z5"];
    // p2p3 + p4p5p6 을 어떻게 쪼개느냐에 따라 p1·p4·p7 셋 다 완성이 된다
    expect(waitingTiles(hand).sort()).toEqual(["p1", "p4", "p7"]);
  });

  it("이미 4장이 다 보이면 그 패는 대기에서 빠진다", () => {
    const hand = WIN17.slice(0, 16);
    const seen = { z5: 4 };
    expect(waitingTiles(hand, 0, { seen })).toEqual([]);
  });

  it("장수가 안 맞으면 대기 계산을 하지 않는다", () => {
    expect(waitingTiles(WIN17)).toEqual([]);
  });
});

describe("손패 코치 — 몇 묶음 됐나", () => {
  it("완성형은 5묶음으로 센다", () => {
    expect(countReadySets(WIN17)).toBe(5);
  });

  it("흩어진 손은 묶음이 적다", () => {
    expect(countReadySets(["p1","p4","p7","s2","s5","s8","z1","z2","z3","z5"])).toBe(0);
  });
});
