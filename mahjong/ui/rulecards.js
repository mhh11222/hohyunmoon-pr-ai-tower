// 첫 시작 때 넘겨 보는 기본 룰 카드 — 내용은 데이터, 그리기는 문자열 조립뿐이라 테스트할 수 있다.

import { tilesHTML } from "./tileface.js";

export const RULE_CARDS = [
  {
    key: "goal",
    title: "이렇게 만들면 이깁니다",
    rows: [
      { tiles: ["p1", "p2", "p3"], cap: "묶음 1" },
      { tiles: ["s5", "s5", "s5"], cap: "묶음 2" },
      { tiles: ["m7", "m8", "m9"], cap: "묶음 3" },
      { tiles: ["z1", "z1", "z1"], cap: "묶음 4" },
      { tiles: ["p6", "p7", "p8"], cap: "묶음 5" },
      { tiles: ["z5", "z5"], cap: "짝" },
    ],
    body: "3장짜리 <b>묶음 5개</b> + 똑같은 2장 <b>짝 1개</b> = 모두 17장. 이걸 먼저 만들면 이깁니다.",
    tip: "머리 없는 참새는 못 난다 — 짝이 꼭 하나 있어야 합니다",
  },
  {
    key: "sets",
    title: "묶음은 두 종류뿐",
    rows: [
      { tiles: ["s3", "s4", "s5"], cap: "계단 — 같은 무늬 연속 3장" },
      { tiles: ["p9", "p9", "p9"], cap: "세쌍둥이 — 똑같은 3장" },
      { tiles: ["z2", "z2", "z2"], cap: "글자패는 세쌍둥이만 됩니다" },
    ],
    body: "계단은 <b>같은 무늬</b>여야 하고 <b>9 다음 1</b>로는 못 잇습니다. 글자패(바람·삼원)는 계단이 안 됩니다.",
    tip: "계단은 같은 재질만, 세쌍둥이는 누구나",
  },
  {
    key: "tiles",
    title: "이 세트의 패 — 모두 140장",
    rows: [
      { tiles: ["p1", "p5", "p9"], cap: "통(筒) 1~9" },
      { tiles: ["s1", "s5", "s8"], cap: "삭(索) 1~9 — 1삭은 새, 8삭은 W" },
      { tiles: ["m1", "m5", "m9"], cap: "만(萬) 1~9 — 5만은 伍" },
      { tiles: ["z1", "z5", "z7"], cap: "바람 東南西北 · 삼원 中發白(白은 백지)" },
      { tiles: ["f1", "f2", "f3", "f4"], cap: "꽃은 사계절 4장뿐" },
    ],
    body: "숫자패는 각 4장씩, 꽃만 1장씩입니다. <b>3인이면 만자를 빼고(104장), 2인이면 만자와 꽃을 뺍니다(100장).</b>",
    tip: "동전(통) → 꿴 꾸러미(삭) → 만 냥 지폐(만)",
  },
  {
    key: "turn",
    title: "한 턴은 두 박자",
    rows: [
      { tiles: ["p3"], cap: "① 산에서 한 장 뽑고" },
      { tiles: ["z4"], cap: "② 필요 없는 한 장을 버린다" },
    ],
    body: "손패는 늘 16장, 딜러만 17장으로 시작합니다. 차례는 <b>반시계</b>로 돌아 내 다음은 오른쪽 사람입니다.",
    tip: "들이쉬고(뽑고) → 내쉬고(버리고) · 마작 테이블 시계는 거꾸로 간다",
  },
  {
    key: "calls",
    title: "남이 버린 패 가져오기",
    rows: [
      { tiles: ["p4", "p4", "p4"], cap: "펑 — 2장 있으면, 누가 버렸든" },
      { tiles: ["s6", "s7", "s8"], cap: "치 — 내 바로 왼쪽 사람이 버린 것만" },
      { tiles: ["z6", "z6"], cap: "완성 — 마지막 짝은 남의 패로도 됩니다" },
    ],
    body: "부르기는 <b>의무가 아니라 선택</b>입니다. 겹치면 <b>완성 &gt; 펑 &gt; 치</b> 순으로 이깁니다. 한 번 공개한 묶음은 다시 바꿀 수 없습니다.",
    tip: "급하면 부르고, 크게 먹으려면 참는다",
  },
  {
    key: "score",
    title: "점수와 산가지",
    rows: [
      { tiles: ["f1"], cap: "내 자리 꽃 (동=春 남=夏 서=秋 북=冬)" },
      { tiles: ["z5", "z5", "z5"], cap: "中·發·白 세쌍둥이" },
    ],
    body: "받는 점수 = <b>(보너스 개수 + 1) × 10점</b>. 보너스는 안 부르고 이김 · 직접 뽑아 이김 · 내 꽃 · 삼원 세쌍둥이. " +
      "<b>남이 버린 패로 이기면 그 사람 혼자</b> 물고, <b>직접 뽑으면 나머지 전원</b>이 냅니다.",
    tip: "쉬운 길을 포기할수록 점수가 오른다",
  },
];

/** 카드 하나를 HTML로 */
export function cardHTML(card, index, total) {
  const dots = Array.from({ length: total }, (_, i) => `<span class="dot${i === index ? " on" : ""}"></span>`).join("");
  const rows = card.rows
    .map(
      (row) => `<div class="rulerow">
        <span class="meld">${tilesHTML(row.tiles, { extraClass: "small" })}</span>
        <span class="cap">${row.cap}</span>
      </div>`
    )
    .join("");
  return `<div class="rulecard">
    <div class="rulehead"><span class="step">${index + 1} / ${total}</span><h2>${card.title}</h2></div>
    ${rows}
    <p>${card.body}</p>
    <p class="tip">💡 ${card.tip}</p>
    <div class="dots">${dots}</div>
  </div>`;
}
