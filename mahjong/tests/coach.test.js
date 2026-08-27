import { describe, it, expect } from "vitest";
import {
  MNEMONICS, mnemonic, tileNote, handProgress, discardAdvice, tenpaiAdvice, coachHand,
} from "../ui/coach.js";

const TENPAI = ["p1","p2","p3","p4","p5","p6","s1","s1","s1","m9","m9","m9","z1","z1","z1","z5"];
const MESSY = ["p1","p4","p7","s2","s5","s8","m1","m3","m5","m7","z1","z2","z3","z5","z6","z7"];

describe("연상 고리", () => {
  it("스펙의 19개가 모두 들어 있다", () => {
    expect(MNEMONICS).toHaveLength(19);
    for (const m of MNEMONICS) {
      expect(m.title).toBeTruthy();
      expect(m.line).toBeTruthy();
    }
  });

  it("키로 찾을 수 있다", () => {
    expect(mnemonic("chow").title).toContain("왼쪽");
    expect(mnemonic("chow").line).toContain("굴러");
    expect(mnemonic("pair").line).toContain("참새");
    expect(mnemonic("없는키")).toBe(null);
  });

  it("특징 있는 패를 누르면 그 패의 고리가 나온다", () => {
    expect(tileNote("s1")).toContain("새처럼");
    expect(tileNote("s8")).toContain("4개");
    expect(tileNote("z7")).toContain("백지");
    expect(tileNote("z5")).toContain("명중");
    expect(tileNote("z2")).toContain("동남아");
    expect(tileNote("p1")).toContain("끝수");
    expect(tileNote("p5")).toContain("가운데");
    expect(tileNote("p2")).toBe(null);
  });

  it("내 자리 꽃은 보너스라고 짚어 준다", () => {
    expect(tileNote("f1", "east")).toContain("보너스");
    expect(tileNote("f2", "east")).not.toContain("보너스");
  });
});

describe("손패 코치", () => {
  it("몇 묶음 됐는지 센다 (공개 묶음 포함)", () => {
    expect(handProgress(TENPAI).sets).toBe(5);
    expect(handProgress(["p1","p2","p3","z5","z5"], [{ tiles: ["s1","s1","s1"] }]).sets).toBe(2);
    expect(handProgress(MESSY).need).toBe(5);
  });

  it("흩어진 손에는 외톨이 글자패부터 버리라고 한다", () => {
    const advice = discardAdvice(MESSY);
    expect(["z1","z2","z3","z5","z6","z7"]).toContain(advice.tile);
    expect(advice.reason).toContain("글자패");
  });

  it("텐파이면 무엇이 오면 되는지 알려준다", () => {
    const t = tenpaiAdvice(TENPAI);
    expect(t.waits).toEqual(["z5"]);
    expect(t.text).toContain("완성");
  });

  it("텐파이가 아니면 대기 안내가 없다", () => {
    expect(tenpaiAdvice(MESSY)).toBe(null);
  });

  it("이미 4장 다 보이는 패는 대기에서 뺀다", () => {
    expect(tenpaiAdvice(TENPAI, [], { seen: { z5: 4 } })).toBe(null);
  });

  it("코치 한 덩어리: 텐파이면 대기, 아니면 버릴 패", () => {
    const ready = coachHand({ concealed: TENPAI, melds: [] });
    expect(ready.tenpai).toBeTruthy();
    expect(ready.advice).toBe(null);
    expect(ready.lines.join(" ")).toContain("완성 1장 전");

    const early = coachHand({ concealed: MESSY, melds: [] });
    expect(early.tenpai).toBe(null);
    expect(early.advice).toBeTruthy();
    expect(early.lines.join(" ")).toContain("정석대로면");
  });
});
