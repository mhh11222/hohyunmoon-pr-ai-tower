// 손패 코치 — 학습 모드의 두뇌. 순수 함수만 있어 테스트할 수 있다.

import { countReadySets, waitingTiles, toCounts } from "../src/hand.js";
import { chooseDiscard, discardReason } from "../src/bot.js";
import { isHonor, isTerminal, tileName, rankOf, suitOf, isNumber, isFlower, SEAT_FLOWER } from "../src/tiles.js";

/** 연상 고리 — 개념마다 한 줄. 도움말 화면에 그대로 실린다. */
export const MNEMONICS = [
  { key: "suits", title: "세 무늬 순서", line: "동전(통) → 꿴 꾸러미(삭) → 만 냥 지폐(만)" },
  { key: "s1", title: "1삭이 새", line: "돈은 한 푼 남으면 새처럼 날아간다" },
  { key: "s8", title: "8삭", line: "지그재그 두 줄 = 4개 + 4개" },
  { key: "dragons", title: "中發白", line: "과녁에 명중 → 돈을 발사 → 백지수표" },
  { key: "white", title: "백(白)", line: "그게 백(白)이다 — 원래 백지" },
  { key: "winds", title: "동남서북", line: "동남아 갔다가 서북쪽으로 돌아온다" },
  { key: "flower", title: "꽃과 자리", line: "봄에는 동쪽에서 해가 뜬다 (봄=동, 여름=남…)" },
  { key: "turn", title: "차례 방향", line: "마작 테이블 시계는 거꾸로 간다 (내 다음은 오른쪽)" },
  { key: "sets", title: "계단 vs 세쌍둥이", line: "계단은 같은 재질만, 세쌍둥이는 누구나" },
  { key: "pair", title: "짝이 필요한 이유", line: "머리 없는 참새는 못 난다" },
  { key: "rhythm", title: "한 턴", line: "들이쉬고(뽑고) → 내쉬고(버리고)" },
  { key: "chow", title: "치는 왼쪽만", line: "계단은 위에서 굴러 내려온다" },
  { key: "priority", title: "부르기 우선순위", line: "이기는 게 먹는 것보다 세고, 세쌍둥이가 계단보다 세다" },
  { key: "discard", title: "뭘 버릴까", line: "끝(1·9)은 외롭다, 가운데(4·5·6)는 인기 많다" },
  { key: "ron", title: "남 패로 이기면", line: "총 쏜 사람이 혼자 물어낸다" },
  { key: "bonus", title: "보너스 원리", line: "쉬운 길을 포기할수록 점수가 오른다" },
  { key: "call", title: "부르기", line: "급하면 부르고, 크게 먹으려면 참는다 (선택이지 의무 아님)" },
  { key: "river", title: "버림패", line: "강물에 흘려보낸 것 — 방금 떨어진 한 장만 낚아챈다" },
  { key: "locked", title: "공개한 묶음", line: "시멘트로 굳은 벽돌 — 빼지도 바꾸지도 못한다" },
];

const BY_KEY = Object.fromEntries(MNEMONICS.map((m) => [m.key, m]));
const SEAT_KO = { east: "동", south: "남", west: "서", north: "북" };

export function mnemonic(key) {
  return BY_KEY[key] || null;
}

/** 패 하나를 눌렀을 때 붙는 설명 */
export function tileNote(id, seatName) {
  if (id === "s1") return BY_KEY.s1.line;
  if (id === "s8") return BY_KEY.s8.line;
  if (id === "z7") return BY_KEY.white.line;
  if (["z5", "z6"].includes(id)) return BY_KEY.dragons.line;
  if (["z1", "z2", "z3", "z4"].includes(id)) return BY_KEY.winds.line;
  if (isFlower(id)) {
    return id === SEAT_FLOWER[seatName]
      ? `내 자리(${SEAT_KO[seatName] || seatName}) 꽃이라 보너스 1개짜리입니다. ${BY_KEY.flower.line}`
      : BY_KEY.flower.line;
  }
  if (isTerminal(id)) return "끝수(1·9)는 이어지는 길이 한쪽뿐이라 외롭습니다";
  if (isNumber(id) && rankOf(id) >= 4 && rankOf(id) <= 6) return "가운데(4·5·6)는 양쪽으로 이어져 인기가 많습니다";
  return null;
}

/** 지금 손이 얼마나 됐는지 */
export function handProgress(concealed, melds = []) {
  const counts = toCounts(concealed);
  const pairs = Object.values(counts).filter((n) => n >= 2).length;
  const sets = countReadySets(concealed) + melds.length;
  return { sets, pairs, need: Math.max(0, 5 - sets) };
}

/** 무엇을 버리는 게 정석인가 */
export function discardAdvice(concealed) {
  const tile = chooseDiscard(concealed);
  return { tile, name: tileName(tile), reason: discardReason(concealed, tile) };
}

/** 대기패 안내 — 완성 1장 전이면 무엇이 오면 되는지 */
export function tenpaiAdvice(concealed, melds = [], opts = {}) {
  const waits = waitingTiles(concealed, melds.length, opts);
  if (!waits.length) return null;
  return { waits, text: `${waits.map(tileName).join(" · ")} 중 하나가 오면 완성입니다` };
}

/** 손패 코치 한 덩어리 — 화면은 이걸 그대로 뿌리기만 하면 된다 */
export function coachHand(player, { seen = null } = {}) {
  const progress = handProgress(player.concealed, player.melds);
  const tenpai = tenpaiAdvice(player.concealed, player.melds, seen ? { seen } : {});
  const advice = tenpai ? null : discardAdvice(player.concealed);
  const lines = [];

  lines.push(
    progress.sets >= 5
      ? "묶음 5개가 다 됐습니다. 이제 짝만 맞으면 완성입니다."
      : `지금 <b>${progress.sets}묶음</b>${progress.pairs ? ` · 짝 후보 ${progress.pairs}개` : ""}입니다. ` +
        `${progress.need}묶음 + 짝 하나가 더 필요합니다.`
  );
  if (tenpai) lines.push(`<b>완성 1장 전!</b> ${tenpai.text}`);
  else if (advice) lines.push(`정석대로면 <b>${advice.name}</b> — ${advice.reason}`);

  return { progress, tenpai, advice, lines };
}

/** 상황마다 따라붙는 연상 고리 키 */
export function mnemonicForPhase(phase) {
  return { draw: "rhythm", discard: "discard", calls: "call", called: "locked", win: "bonus" }[phase] || null;
}

export { isHonor, isTerminal, suitOf };
