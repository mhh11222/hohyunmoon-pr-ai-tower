// 2D 패 얼굴 — 실물 세트의 특징이 눈에 보이게.
//   1삭은 새(공작), 8삭은 지그재그 W 두 줄, 5·7·9삭엔 빨간 막대,
//   만자 5는 '伍', 백(白)은 무늬 없는 백지패.
// 순수 함수(tileFace)와 HTML 조립(tileHTML)을 나눠 테스트할 수 있게 했다.

import { isFlower, isHonor, rankOf, suitOf, tileName } from "../src/tiles.js";

const CHAR_DIGITS = ["", "一", "二", "三", "四", "伍", "六", "七", "八", "九"];

const HONOR_GLYPH = { z1: "東", z2: "南", z3: "西", z4: "北", z5: "中", z6: "發", z7: "" };
const HONOR_TONE = { z1: "ink", z2: "ink", z3: "ink", z4: "ink", z5: "red", z6: "green", z7: "blank" };
const FLOWER_GLYPH = { f1: "春", f2: "夏", f3: "秋", f4: "冬" };
const FLOWER_TONE = { f1: "green", f2: "red", f3: "red", f4: "green" };

/** 숫자패 알갱이 배치 — 행마다 몇 개인지 */
const DOT_ROWS = {
  1: [1], 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [2, 1, 2],
  6: [2, 2, 2], 7: [3, 2, 2], 8: [2, 2, 2, 2], 9: [3, 3, 3],
};
const BAMBOO_ROWS = {
  1: [1], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2],
  6: [3, 3], 7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3],
};

/** 빨간 알갱이 자리 — [행, 칸] */
const RED_DOTS = { 1: [[0, 0]], 5: [[1, 0]], 7: [[0, 0], [0, 1], [0, 2]] };
const RED_BAMBOO = { 5: [[1, 0]], 7: [[0, 0]], 9: [[1, 0], [1, 1], [1, 2]] };

function pipRows(rows, reds = []) {
  return rows.map((n, r) =>
    Array.from({ length: n }, (_, c) => ({
      red: reds.some(([rr, cc]) => rr === r && cc === c),
    }))
  );
}

/**
 * 패 하나의 얼굴 정보 (순수 데이터).
 * kind: dots | bamboo | bird | zigzag | char | honor | flower | blank
 */
export function tileFace(id) {
  const suit = suitOf(id);
  const rank = rankOf(id);
  const name = tileName(id);

  if (isFlower(id)) {
    return { id, kind: "flower", glyph: FLOWER_GLYPH[id], tone: FLOWER_TONE[id], name };
  }
  if (isHonor(id)) {
    if (id === "z7") return { id, kind: "blank", glyph: "", tone: "blank", name }; // 백지패
    return { id, kind: "honor", glyph: HONOR_GLYPH[id], tone: HONOR_TONE[id], name };
  }
  if (suit === "m") {
    return { id, kind: "char", glyph: CHAR_DIGITS[rank], suffix: "萬", tone: "ink", rank, name };
  }
  if (suit === "s") {
    if (rank === 1) return { id, kind: "bird", glyph: "🐦", tone: "green", rank, name }; // 1삭은 새
    if (rank === 8) return { id, kind: "zigzag", tone: "green", rank, name };            // 8삭은 W 두 줄
    return { id, kind: "bamboo", rows: pipRows(BAMBOO_ROWS[rank], RED_BAMBOO[rank]), tone: "green", rank, name };
  }
  return {
    id, kind: "dots", rows: pipRows(DOT_ROWS[rank], RED_DOTS[rank]),
    big: rank === 1, tone: "teal", rank, name,
  };
}

function pipsHTML(face, shape) {
  return face.rows
    .map(
      (row) =>
        `<span class="pip-row">${row
          .map((p) => `<span class="pip ${shape}${p.red ? " red" : ""}"></span>`)
          .join("")}</span>`
    )
    .join("");
}

/** 패 하나의 HTML. back=true면 뒷면 */
export function tileHTML(id, { back = false, extraClass = "", label = "" } = {}) {
  if (back) return `<span class="tile back ${extraClass}"></span>`;
  const face = tileFace(id);
  let inner = "";
  if (face.kind === "dots") inner = `<span class="pips${face.big ? " big" : ""}">${pipsHTML(face, "dot")}</span>`;
  else if (face.kind === "bamboo") inner = `<span class="pips">${pipsHTML(face, "bar")}</span>`;
  else if (face.kind === "bird") inner = `<span class="glyph bird">${face.glyph}</span>`;
  else if (face.kind === "zigzag") inner = `<span class="zigzag">W<br>W</span>`;
  else if (face.kind === "char") inner = `<span class="glyph char">${face.glyph}</span><span class="suffix">${face.suffix}</span>`;
  else if (face.kind === "blank") inner = `<span class="blankface"></span>`;
  else inner = `<span class="glyph">${face.glyph}</span>`;

  const aria = face.name;
  return `<span class="tile ${face.tone} ${face.kind} ${extraClass}" data-tile="${id}" role="img" aria-label="${aria}" title="${aria}">${inner}${
    label ? `<span class="tile-label">${label}</span>` : ""
  }</span>`;
}

export function tilesHTML(ids, opts) {
  return ids.map((id) => tileHTML(id, opts)).join("");
}
