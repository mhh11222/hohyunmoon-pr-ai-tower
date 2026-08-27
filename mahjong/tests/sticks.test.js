import { describe, it, expect } from "vitest";
import {
  DENOMS, TOTAL_STICKS, TOTAL_VALUE, STARTING, createBank, purseValue,
  transfer, exactCombo, payCombo, settleUp, exchange,
} from "../src/sticks.js";

describe("이 세트의 산가지", () => {
  it("52개 / 액면가 10·50·100", () => {
    expect(TOTAL_STICKS).toBe(52);
    expect(DENOMS.map((d) => d.value).sort((a, b) => a - b)).toEqual([10, 50, 100]);
    expect(DENOMS.find((d) => d.value === 10)).toMatchObject({ count: 22, mark: "red1" });
    expect(DENOMS.find((d) => d.value === 50)).toMatchObject({ count: 21, mark: "black8" });
    expect(DENOMS.find((d) => d.value === 100)).toMatchObject({ count: 9, mark: "red5" });
    expect(TOTAL_VALUE).toBe(2170);
  });

  it("시작액: 4인 500 / 3인 700 / 2인 1000", () => {
    expect(purseValue(STARTING[4])).toBe(500);
    expect(purseValue(STARTING[3])).toBe(700);
    expect(purseValue(STARTING[2])).toBe(1000);
  });

  it("나눠주고 남은 건 거스름돈 더미 — 총합은 언제나 2170", () => {
    for (const n of [2, 3, 4]) {
      const bank = createBank(n);
      const total = bank.players.reduce((s, p) => s + purseValue(p), 0) + purseValue(bank.pot);
      expect(total).toBe(TOTAL_VALUE);
      expect(Object.values(bank.pot).every((v) => v >= 0)).toBe(true);
    }
  });
});

describe("거스름돈", () => {
  it("딱 맞는 조합이 있으면 그걸로 낸다", () => {
    expect(exactCombo({ 10: 5, 50: 1, 100: 0 }, 30)).toEqual({ 10: 3, 50: 0, 100: 0 });
    expect(exactCombo({ 10: 0, 50: 1, 100: 0 }, 30)).toBe(null);
  });

  it("못 맞추면 초과분이 가장 적게 낸다", () => {
    const pay = payCombo({ 10: 0, 50: 1, 100: 1 }, 30);
    expect(pay.paid).toBe(50);
    expect(pay.over).toBe(20);
  });

  it("크게 내고 더미에서 거슬러 받는다", () => {
    const bank = createBank(4);
    bank.players[1] = { 10: 0, 50: 0, 100: 1 }; // 100짜리 하나뿐
    const potBefore = purseValue(bank.pot);
    const move = transfer(bank, 1, 0, 20);
    expect(move.hand).toEqual({ 10: 0, 50: 0, 100: 1 });
    expect(purseValue(move.change)).toBe(80);
    expect(purseValue(bank.players[1])).toBe(80);
    expect(purseValue(bank.players[0])).toBe(500 + 20);
    expect(purseValue(bank.pot) + 500 + 20 + 80).toBe(potBefore + 100 + 500);
  });

  it("옮겨도 산가지 총합은 변하지 않는다", () => {
    const bank = createBank(3);
    const before = bank.players.reduce((s, p) => s + purseValue(p), 0) + purseValue(bank.pot);
    transfer(bank, 0, 1, 70);
    transfer(bank, 2, 1, 40);
    transfer(bank, 1, 0, 110);
    const after = bank.players.reduce((s, p) => s + purseValue(p), 0) + purseValue(bank.pot);
    expect(after).toBe(before);
  });

  it("낼 산가지가 모자라면 거부한다", () => {
    const bank = createBank(4);
    expect(() => transfer(bank, 0, 1, 900)).toThrow();
  });
});

describe("정산과 환전", () => {
  it("손익 = 지금 총점 − 시작액", () => {
    const bank = createBank(4);
    transfer(bank, 2, 0, 40);
    const rows = settleUp(bank);
    expect(rows[0]).toMatchObject({ seat: 0, total: 540, delta: 40 });
    expect(rows[2]).toMatchObject({ seat: 2, total: 460, delta: -40 });
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(0);
  });

  it("환율을 걸면 돈으로 바꿔 보여준다 (계산·표시만)", () => {
    const bank = createBank(2);
    transfer(bank, 1, 0, 80);
    const rows = exchange(bank, { pointsPerUnit: 10, moneyPerUnit: 100 });
    expect(rows[0].money).toBe(800);
    expect(rows[1].money).toBe(-800);
    expect(rows[0].currency).toBe("원");
  });
});
