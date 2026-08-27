import { describe, it, expect } from "vitest";
import { tileFace, tileHTML } from "../ui/tileface.js";
import { allTileIds } from "../src/tiles.js";

describe("패 얼굴 — 실물 세트의 특징이 보이게", () => {
  it("1삭은 막대가 아니라 새(공작)", () => {
    expect(tileFace("s1").kind).toBe("bird");
  });

  it("8삭은 지그재그 W 두 줄", () => {
    expect(tileFace("s8").kind).toBe("zigzag");
    expect(tileHTML("s8")).toContain("W<br>W");
  });

  it("만자 5는 '伍'", () => {
    expect(tileFace("m5")).toMatchObject({ kind: "char", glyph: "伍", suffix: "萬" });
  });

  it("백(白)은 무늬 없는 백지패", () => {
    expect(tileFace("z7")).toMatchObject({ kind: "blank", glyph: "" });
    expect(tileHTML("z7")).toContain("blankface");
  });

  it("中은 빨강, 發은 초록", () => {
    expect(tileFace("z5")).toMatchObject({ glyph: "中", tone: "red" });
    expect(tileFace("z6")).toMatchObject({ glyph: "發", tone: "green" });
  });

  it("꽃은 春夏秋冬 넷뿐", () => {
    expect(["f1", "f2", "f3", "f4"].map((f) => tileFace(f).glyph)).toEqual(["春", "夏", "秋", "冬"]);
  });
});

describe("알갱이 배치", () => {
  const pipCount = (id) => tileFace(id).rows.reduce((n, row) => n + row.length, 0);

  it("숫자만큼 알갱이가 있다 (1삭·8삭은 그림이라 제외)", () => {
    for (let r = 1; r <= 9; r++) expect(pipCount(`p${r}`)).toBe(r);
    for (const r of [2, 3, 4, 5, 6, 7, 9]) expect(pipCount(`s${r}`)).toBe(r);
  });

  it("5·7·9삭엔 빨간 막대가 섞인다", () => {
    const hasRed = (id) => tileFace(id).rows.flat().some((p) => p.red);
    expect(hasRed("s5")).toBe(true);
    expect(hasRed("s7")).toBe(true);
    expect(hasRed("s9")).toBe(true);
    expect(hasRed("s6")).toBe(false);
  });

  it("1통은 큰 고리 하나", () => {
    expect(tileFace("p1")).toMatchObject({ big: true });
    expect(pipCount("p1")).toBe(1);
  });
});

describe("HTML 조립", () => {
  it("모든 패가 이름표(aria-label)를 갖는다", () => {
    for (const id of allTileIds()) {
      const html = tileHTML(id);
      expect(html).toContain(`data-tile="${id}"`);
      expect(html).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("뒷면은 무늬를 흘리지 않는다", () => {
    const back = tileHTML("z5", { back: true });
    expect(back).toContain("back");
    expect(back).not.toContain("中");
    expect(back).not.toContain("data-tile");
  });
});
