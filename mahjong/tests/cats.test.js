import { describe, it, expect } from "vitest";
import { CATS, opponentsFor, seatCats, EMOTES, emoteFor } from "../ui/cats.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("고양이 세 마리", () => {
  it("포도·감자·막내", () => {
    expect(Object.keys(CATS)).toEqual(["podo", "gamja", "maknae"]);
    expect(CATS.podo.name).toBe("포도");
    expect(CATS.gamja.name).toBe("감자");
    expect(CATS.maknae.name).toBe("막내");
  });

  it("아바타 사진이 실제로 저장소에 있다", () => {
    for (const cat of Object.values(CATS)) {
      expect(existsSync(join(ROOT, cat.avatar))).toBe(true);
    }
  });

  it("포도가 제일 작아 울음이 제일 높고, 막내가 제일 커서 제일 낮다", () => {
    expect(CATS.podo.pitch).toBeGreaterThan(CATS.gamja.pitch);
    expect(CATS.gamja.pitch).toBeGreaterThan(CATS.maknae.pitch);
    expect(CATS.maknae.meowLen).toBeGreaterThan(CATS.podo.meowLen);
  });
});

describe("인원별 배정 — 2인 포도 / 3인 감자·포도 / 4인 전부", () => {
  it("2인이면 포도", () => {
    expect(opponentsFor(2).map((c) => c.name)).toEqual(["포도"]);
  });
  it("3인이면 감자와 포도", () => {
    expect(opponentsFor(3).map((c) => c.name)).toEqual(["감자", "포도"]);
  });
  it("4인이면 세 마리 다", () => {
    expect(opponentsFor(4).map((c) => c.name).sort()).toEqual(["감자", "막내", "포도"]);
  });
  it("자리 배열에서 내 자리는 null", () => {
    const seats = seatCats(4, 0);
    expect(seats[0]).toBe(null);
    expect(seats.filter(Boolean)).toHaveLength(3);
    expect(seatCats(2, 0)[1].name).toBe("포도");
  });
  it("5인은 거부", () => {
    expect(() => opponentsFor(5)).toThrow();
  });
});

describe("감정 표현", () => {
  it("인사·부르기·완성·잃음·뺏김·유국이 다 있다", () => {
    for (const kind of ["greet", "call", "chow", "win", "lose", "robbed", "exhausted"]) {
      const spec = emoteFor(kind);
      expect(spec).toBeTruthy();
      expect(spec.emoji).toBeTruthy();
    }
  });

  it("우는 상황과 조용한 상황이 나뉜다", () => {
    expect(EMOTES.greet.meow).toBe(true);
    expect(EMOTES.robbed.meow).toBe(true);
    expect(EMOTES.draw.meow).toBe(false);
    // 부르기·완성은 외치기(shout)가 소리를 맡아 야옹은 끈다
    expect(EMOTES.call.meow).toBe(false);
    expect(EMOTES.win.meow).toBe(false);
  });

  it("모르는 상황이면 null", () => {
    expect(emoteFor("없음")).toBe(null);
  });
});
