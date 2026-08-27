// 상대 캐릭터 — 실제 우리 집 고양이 세 마리.
//   포도: 제일 작다 → 울음소리가 제일 높다
//   감자: 중간
//   막내: 제일 크고 뚱뚱하다 → 제일 낮고 굵다
// 감정 표현은 말풍선 이모지로. 로직은 순수 데이터라 테스트할 수 있다.

export const CATS = {
  podo: {
    key: "podo",
    name: "포도",
    avatar: "assets/cats/podo.jpg",
    size: "small",
    pitch: 1.35,      // 울음소리 높낮이 (1 = 기준)
    meowLen: 0.55,
    intro: "제일 작지만 제일 매섭습니다",
  },
  gamja: {
    key: "gamja",
    name: "감자",
    avatar: "assets/cats/gamja.jpg",
    size: "medium",
    pitch: 1.0,
    meowLen: 0.7,
    intro: "느긋하게 계단을 모읍니다",
  },
  maknae: {
    key: "maknae",
    name: "막내",
    avatar: "assets/cats/maknae.jpg",
    size: "large",
    pitch: 0.72,      // 제일 크고 뚱뚱해서 낮고 굵다
    meowLen: 0.9,
    intro: "제일 크고 뚱뚱한 늦둥이",
  },
};

/**
 * 인원수 → 상대 고양이들.
 *   2인: 포도
 *   3인: 감자, 포도
 *   4인: 포도, 감자, 막내 (전부)
 * 반환 배열은 "내 다음 자리부터 반시계 순서"로 앉힌다.
 */
export function opponentsFor(playerCount) {
  if (playerCount === 2) return [CATS.podo];
  if (playerCount === 3) return [CATS.gamja, CATS.podo];
  if (playerCount === 4) return [CATS.podo, CATS.gamja, CATS.maknae];
  throw new Error(`지원하지 않는 인원: ${playerCount}`);
}

/** seat 번호 → 고양이. human 자리는 null. */
export function seatCats(playerCount, humanSeat = 0) {
  const cats = opponentsFor(playerCount);
  const out = Array.from({ length: playerCount }, () => null);
  for (let i = 0; i < cats.length; i++) {
    out[(humanSeat + 1 + i) % playerCount] = cats[i];
  }
  return out;
}

/**
 * 상황별 감정 표현. 말풍선에 그대로 띄운다.
 *   meow: 이때 울음소리도 낸다
 */
export const EMOTES = {
  greet:    { emoji: "😺",  text: "잘 부탁해",  meow: true },   // 판 시작
  draw:     { emoji: "🤔",  text: "",           meow: false },  // 고민하며 뽑기
  call:     { emoji: "😼",  text: "펑!",        meow: true },   // 펑·치·깡
  chow:     { emoji: "😼",  text: "치!",        meow: true },
  win:      { emoji: "😻",  text: "완성!",      meow: true },   // 이겼다
  lose:     { emoji: "😿",  text: "",           meow: true },   // 산가지를 내준다
  robbed:   { emoji: "😾",  text: "야옹!!",     meow: true },   // 내 버림패를 뺏겼다
  tenpai:   { emoji: "😳",  text: "",           meow: false },  // (연출용) 흠칫
  waiting:  { emoji: "💤",  text: "",           meow: false },  // 오래 기다림
  exhausted:{ emoji: "😹",  text: "무승부다",   meow: false },  // 유국
};

export function emoteFor(kind) {
  return EMOTES[kind] || null;
}
