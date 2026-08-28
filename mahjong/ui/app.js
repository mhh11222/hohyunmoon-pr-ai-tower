// 조작 — 규칙 엔진과 화면을 잇는다. 규칙 판단은 전부 엔진이 한다.
//
// 두 가지 모드로 돈다.
//   학습 모드: 자막·손패 코치·텐파이 표시·연상 고리·한 수 물리기. 봇도 천천히 둔다.
//   실전 모드: 힌트 없이 빠르게. 누가 무엇을 버렸는지만 알려준다.

import {
  createGame, startHand, nextHand, draw, discard, resolveDiscard, declareWin,
  snapshotGame, restoreGame, seenCounts, PHASE,
} from "../src/game.js";
import { makeBot, botContext, LEVEL, LEVEL_INFO } from "../src/bot.js";
import { isWinningHand } from "../src/hand.js";
import { tileName, SEATS, sortTiles } from "../src/tiles.js";
import { coachHand, tileNote, mnemonic, MNEMONICS } from "./coach.js";
import { RULE_CARDS, cardHTML } from "./rulecards.js";
import { seatCats, emoteFor } from "./cats.js";
import {
  render, showSheet, hideSheet, resultSheet, callButtonLabel, seatLabel, exchangeSheetHTML,
} from "./view.js";
import { createTable } from "./table3d.js";
import { createAudio, SHOUTS } from "./sound.js";

export const MODES = {
  learn: {
    key: "learn", name: "학습 모드", guide: true, coach: true, undo: true,
    botDelay: 1300, callDelay: 800,
    speed: 2.4, // 3D 모션을 크게 늦춰 실제로 따라할 수 있게
  },
  real: {
    key: "real", name: "실전 모드", guide: false, coach: false, undo: false,
    botDelay: 500, callDelay: 300,
    speed: 1.25,
  },
};

const state = {
  game: null,
  human: 0,
  bots: [],
  mode: MODES.learn,
  buttons: [],
  tools: [],
  subtitle: "",
  coach: null,
  note: null,
  picked: null,
  rounds: 4,
  paused: false,
  flash: null,
  ruleCard: null,   // 룰 카드를 넘겨 보는 중이면 몇 번째인지
  cats: [],         // seat → 고양이 (내 자리는 null)
  emotes: {},       // seat → 지금 띄운 말풍선
  setup: {
    playerCount: 2,
    level: LEVEL.BEGINNER,
    extendedBonuses: false,
    allowKong: false,
    scoring: "10+10",   // 기본점+보너스점: 10+10 / 30+10 / 10+20
    rate: 100,          // 환율: 10점당 원
  },
  pending: null,   // 일시정지 중 밀린 진행
  undoStack: [],
  timer: null,
  drag: null,          // 길게 눌러 옮기는 중인 패 { index }
  handReveal: null,    // 배패 중이면 지금까지 받은 장수 (null = 전부 보임)
  subtitleTile: null,  // 자막 옆에 크게 보여줄 패 (방금 버려진 패)
  suppressClick: false,
  table: null,      // 3D 테이블 (없으면 2D로 돈다)
  use3D: false,
  sound: null,
  music: true,
  sfx: true,
};

/* ── 말하기 ─────────────────────────────────────────── */

/** 학습 모드면 길게, 실전 모드면 짧게. 직전 알림(flash)이 있으면 앞에 붙인다. */
function say(full, terse = "") {
  const head = state.flash ? `${state.flash} ` : "";
  state.flash = null;
  state.subtitle = head + (state.mode.guide ? full : terse);
}

function withMnemonic(text, key) {
  const m = mnemonic(key);
  return m && state.mode.guide ? `${text} <i>— ${m.line}</i>` : text;
}

/* ── 진행 ───────────────────────────────────────────── */

function table() {
  return state.use3D ? state.table : null;
}

/** 소리와 3D는 사용자가 버튼을 누른 뒤에 켠다 (자동 재생 금지) */
async function prepare() {
  if (!state.sound) {
    state.sound = createAudio();
    state.sound.unlock();
    if (state.music) state.sound.startMusic();
  }
  if (state.table === null) {
    state.table = (await createTable(document.getElementById("table3d"), { sound: state.sound })) || false;
    state.use3D = !!state.table;
    document.getElementById("stage").hidden = !state.use3D;
    document.getElementById("center").hidden = state.use3D;
    if (state.use3D) {
      state.table.setSpeed(state.mode.speed);
      state.table.start();
      addEventListener("resize", () => state.table.resize());
      new ResizeObserver(() => state.table.resize()).observe(document.getElementById("stage"));
    }
  }
}

/** 점수 설정 문자열 → 기본점·보너스점 */
const SCORING = {
  "10+10": { basePoint: 10, bonusPoint: 10, label: "기본 10점 + 보너스당 10점 (권장)" },
  "30+10": { basePoint: 30, bonusPoint: 10, label: "기본 30점 + 보너스당 10점 — 판마다 굵직하게" },
  "10+20": { basePoint: 10, bonusPoint: 20, label: "기본 10점 + 보너스당 20점 — 보너스가 무겁게" },
};

async function newGame(mode) {
  const { playerCount, level, extendedBonuses, allowKong, scoring } = state.setup;
  state.mode = mode;
  state.table?.setSpeed?.(mode.speed);
  state.rounds = playerCount === 4 ? 4 : 4;
  state.paused = false;
  state.undoStack = [];
  state.game = createGame({
    playerCount,
    seed: (Date.now() % 1e9) | 0,
    options: { extendedBonuses, allowKong, ...SCORING[scoring] },
  });
  state.bots = Array.from({ length: playerCount }, () => makeBot(level));
  state.cats = seatCats(playerCount, state.human);
  state.emotes = {};
  startHand(state.game);
  hideSheet();
  await prepare();
  await ceremony();
}

/** 섞기 → 산 쌓기 → 주사위 → 배패를 눈으로 보여 준다 */
async function ceremony() {
  const g = state.game;
  state.picked = null;
  state.note = null;
  state.undoStack = [];
  if (!state.use3D) {
    announceDeal();
    greetCats();
    return step();
  }
  const ordinal = ["", "한", "두", "세", "네"];
  const who = (seat) => (seat === state.human ? "나" : state.cats[seat]?.name ?? `${seat}번`);
  const stageText = (name, payload) => {
    if (name === "dealerRoll" && payload) {
      const [a, b] = payload.dice;
      return [
        `먼저 <b>첫 딜러</b>를 뽑습니다. 주사위 <b>${a}+${b}=${payload.sum}</b> — 나부터 반시계로 ` +
          `${payload.sum}번째 자리… <b>${who(g.dealerIndex)}</b>가 첫 딜러(동)입니다.`,
        `딜러 뽑기 — ${who(g.dealerIndex)}`,
      ];
    }
    if (name === "shuffle") return ["패를 전부 엎어 <b>휘휘 섞습니다</b>. 실제로는 두 손으로 크게 원을 그리며 섞으세요.", "섞는 중"];
    if (name === "wall") return [
      `섞은 패를 <b>2단으로 쌓아 산(벽)</b>을 만듭니다. ${g.playerCount}인이니 벽 ${g.playerCount}개 — ` +
        `아래 칸을 먼저 깔고 위 칸을 얹습니다. 산은 이어진 하나의 담입니다.`,
      "산 쌓기",
    ];
    if (name === "camera") return ["산이 다 섰습니다. 이제 자리에 앉아 <b>상대를 마주 보고</b> 칩니다.", "착석"];
    if (name === "dice" && payload) {
      const [a, b] = payload.dice;
      const wallOwner = who(payload.opening.wallIndex);
      return [
        `딜러 <b>${who(g.dealerIndex)}</b>가 주사위를 굴려 <b>${a}+${b}=${payload.sum}</b> — 딜러 자신부터 반시계로 ` +
          `${payload.sum}자리를 세면 <b>${wallOwner}의 벽</b>. 그 벽 오른쪽 끝에서 ${payload.sum}번째 벽돌 뒤가 ` +
          `<b>산의 입구</b>가 되고, 패는 여기서부터 뗍니다.`,
        `주사위 ${a}+${b}=${payload.sum} → ${wallOwner}의 벽`,
      ];
    }
    if (name === "dealRound" && payload) {
      return [
        `<b>${ordinal[payload.round]} 바퀴째</b> — 딜러 ${who(g.dealerIndex)}부터 반시계 차례로 입구에서 <b>벽돌 2개(4장)씩</b> 가져갑니다.`,
        `배패 ${payload.round}/4바퀴`,
      ];
    }
    if (name === "dealExtra") return [`4바퀴가 끝나면 <b>딜러 ${who(g.dealerIndex)}만 1장 더</b> — 딜러 17장, 나머지 16장.`, "딜러 +1장"];
    return [];
  };
  state.buttons = [];
  state.handReveal = 0; // 배패 전 — 내 손은 아직 비어 있다
  render(state);

  const who2 = who;

  /** 의식의 매듭 — 학습 모드면 중앙 팝업으로 멈추고, 계속을 눌러야 진행 */
  const gate = (name, payload) => {
    if (!state.mode.guide) return; // 실전 모드는 자막만으로 흘러간다
    const html = gateHTML(name, payload, g, who2);
    if (!html) return;
    return new Promise((resolve) => {
      sheet(html, [{ label: "계속 ▶", style: "hot", onClick: () => { hideSheet(); resolve(); } }]);
    });
  };

  await state.table.newHand(g, {
    humanSeat: state.human,
    cats: state.cats,
    onGate: gate,
    onStage: (name, payload) => {
      if (name === "dealGrab") {
        if (payload.seat === state.human) {
          state.handReveal = Math.min(
            (state.handReveal ?? 0) + payload.count,
            g.players[state.human].concealed.length
          );
          render(state);
        }
        return;
      }
      const [full, terse] = stageText(name, payload);
      if (full) { say(full, terse); render(state); }
    },
  });
  state.handReveal = null; // 배패 끝 — 손패 전부 공개·정렬 상태
  announceDeal();
  greetCats();
  step();
}

/** 게이트 팝업 내용 — "무엇이 나왔고, 무슨 뜻이고, 다음은 무엇" */
function gateHTML(name, payload, g, who) {
  const dealer = who(g.dealerIndex);
  if (name === "dealerRoll") {
    const [a, b] = payload.dice;
    const chain = Array.from({ length: payload.sum }, (_, i) => {
      const seat = i % g.playerCount;
      return `${who(seat)}<i>(${i + 1})</i>`;
    }).join(" → ");
    return `<h2>🎲 첫 딜러 뽑기</h2>
      <p>첫 판의 주사위는 <b>판을 준비한 사람(나)</b>이 굴리는 게 관례입니다.</p>
      <p>주사위가 <b>${a} + ${b} = ${payload.sum}</b>.
      굴린 사람인 <b>나를 1로 놓고 반시계로</b> ${payload.sum}까지 셉니다:</p>
      <p class="chain">${chain}</p>
      <p>${payload.sum}번째가 <b>${dealer}</b> — 그래서 <b>${dealer}가 첫 딜러(동)</b>입니다.
      딜러는 17장을 받고 첫 패를 버리며 판을 엽니다.</p>
      <p class="hint">다음 — 패 ${g.playerCount === 4 ? 140 : g.playerCount === 3 ? 104 : 100}장을 전부 엎어 섞습니다.</p>`;
  }
  if (name === "wall") {
    const total = payload.counts.reduce((sum, n) => sum + n * 2, 0);
    const walls = payload.counts
      .map((n, i) => `${who(i)} 앞에 벽돌 ${n}개 = <b>${n * 2}장</b>`)
      .join("<br>");
    return `<h2>🧱 산(벽)을 다 쌓았습니다</h2>
      <p>섞은 패를 <b>2단(위아래 두 층)</b>으로 쌓아 각자 앞에 담을 만들었습니다.
      <b>벽돌 1개 = 위 1장 + 아래 1장 = 2장</b>이라는 걸 기억하세요.</p>
      <p class="chain">${walls}<br>합계 <b>${total}장</b> — 이 판에 쓰는 패 전부입니다.</p>
      <p>이 담들은 이어진 <b>하나의 산</b>입니다. 어디서부터 뜯을지는 딜러의 주사위가 정합니다.</p>
      <p class="hint">다음 — 딜러 ${dealer}가 주사위 2개를 굴려 <b>산의 입구</b>를 정합니다.</p>`;
  }
  if (name === "opening") {
    const [a, b] = payload.dice;
    const wallOwner = who(payload.opening.wallIndex);
    return `<h2>🎲 산의 입구 정하기</h2>
      <p>딜러 <b>${dealer}</b>가 굴려 <b>${a} + ${b} = ${payload.sum}</b>.</p>
      <p>① 딜러 자신부터 반시계로 ${payload.sum}자리를 세면 → <b>${wallOwner}의 벽</b><br>
      ② 그 벽 <b>오른쪽 끝에서 ${payload.sum}번째 벽돌</b> 뒤가 <b>산의 입구</b>가 됩니다.</p>
      <p>패는 입구에서 시작해 담을 따라 돌며 뜯고, 꽃·깡 보충은 반대쪽(담 뒤)에서 가져옵니다.
      이 의식 덕분에 아무도 어느 패가 어디 있는지 알 수 없습니다.</p>
      <p class="hint">다음 — 배패. 딜러 ${dealer}부터 반시계로 <b>벽돌 2개(4장)씩</b> 4바퀴 가져갑니다.
      내 패는 가져올 때마다 아래에 쌓입니다.</p>`;
  }
  if (name === "dealt") {
    return `<h2>🀄 배패 끝</h2>
      <p>모두 <b>16장</b>, 딜러 <b>${dealer}</b>만 <b>17장</b>을 받았습니다.
      손에 꽃이 있으면 눕혀 두고 담 뒤에서 1장씩 보충했습니다.</p>
      <p>손패는 통 → 삭 → 만 → 바람 → 삼원 순으로 <b>정렬</b>해 둡니다.
      (길게 눌러 끌면 언제든 직접 배열로 바꿀 수 있습니다.)</p>
      <p class="hint">이제 <b>본게임</b> — 딜러 ${dealer}가 첫 패를 버리며 시작합니다.
      여기부터는 위쪽 자막으로만 설명합니다.</p>`;
  }
  return null;
}

function announceDeal() {
  const g = state.game;
  state.picked = null;
  state.subtitleTile = null;
  state.note = null;
  state.undoStack = [];
  const dice = g.log.find((e) => e.type === "dice");
  const flowers = g.log.find((e) => e.type === "flowers");
  say(
    `<b>주사위 ${dice.dice.join("+")}=${dice.sum}</b> → 산의 입구를 정하고, 벽돌 2개(4장)씩 4바퀴 나눴습니다. ` +
      `손패 16장, 딜러만 17장.` +
      (flowers ? ` 꽃 ${flowers.events.length}장은 눕히고 담 뒤쪽에서 보충했습니다.` : ""),
    `${g.handNumber}판 시작 — 딜러는 ${seatLabel(g, g.dealerIndex)}`
  );
}

function step() {
  const g = state.game;
  state.buttons = [];
  updateCoach();
  updateTools();
  table()?.sync(g);

  if (g.phase === PHASE.WON || g.phase === PHASE.EXHAUSTED) {
    render(state);
    return finishHand();
  }
  if (g.phase === PHASE.CALLS) return handleCalls();
  if (g.turn === state.human) return humanTurn();

  render(state);
  wait(state.mode.botDelay, botTurn);
}

function humanTurn() {
  const g = state.game;
  const me = g.players[state.human];

  if (g.phase === PHASE.DRAW) {
    state.subtitleTile = null;
    say(
      withMnemonic("<b>내 차례</b> — 먼저 한 장 뽑습니다.", "rhythm"),
      "내 차례 — 뽑기"
    );
    state.buttons = [{ label: "뽑기", style: "hot", onClick: () => { remember(); table()?.drawTile(state.human, state.human); draw(g); step(); } }];
    return render(state);
  }

  if (state.picked) {
    state.note = state.mode.coach ? tileNote(state.picked.id, me.seatName) : null;
    say(
      `<b>${tileName(state.picked.id)}</b>를 버릴까요? 버린 패는 되돌릴 수 없습니다.`,
      `${tileName(state.picked.id)} 버리기?`
    );
    state.buttons = [
      { label: `${tileName(state.picked.id)} 버리기`, style: "hot", onClick: doDiscard },
      { label: "취소", style: "ghost", onClick: () => { state.picked = null; state.note = null; step(); } },
    ];
    return render(state);
  }

  if (isWinningHand(me.concealed, me.melds.length)) {
    say(
      withMnemonic("<b>완성!</b> 묶음 5개 + 짝 1개가 다 됐습니다. 더 크게 먹으려면 패를 눌러 계속 갈 수도 있습니다.", "bonus"),
      "완성할 수 있습니다"
    );
    state.buttons = [{ label: "완성!", style: "win", onClick: () => { remember(); declareWin(g, state.human); step(); } }];
    return render(state);
  }

  say(
    withMnemonic("버릴 패를 고르세요.", "discard"),
    "버릴 패를 고르세요"
  );
  return render(state);
}

function doDiscard() {
  const tile = state.picked.id;
  state.picked = null;
  state.note = null;
  remember();
  table()?.discardTile(state.human, tile, state.human);
  discard(state.game, tile);
  step();
}

function handleCalls() {
  const g = state.game;
  const mine = g.pending.calls.filter((c) => c.seat === state.human);
  const who = seatLabel(g, g.pending.from);

  state.subtitleTile = g.pending.tile;

  if (!mine.length) {
    say(
      `${who}가 <b>${tileName(g.pending.tile)}</b>를 버렸습니다 — 이 패로는 내 손에서 ` +
        `펑(같은 패 2장 필요)·치(계단 조각 필요)가 안 되어 그냥 지나갑니다.`,
      `${who} → ${tileName(g.pending.tile)}`
    );
    render(state);
    return wait(state.mode.callDelay, () => resolveWith(null));
  }

  say(
    `${who}가 버린 <b>${tileName(g.pending.tile)}</b> — <b>가져올 수 있습니다!</b> ` +
      `아래 버튼으로 펑·치·완성을 외치고, 원치 않으면 패스. ` +
      `<i>급하면 부르고, 크게 먹으려면 참는다</i>`,
    `${who} → ${tileName(g.pending.tile)} · 가져올 수 있습니다`
  );
  state.buttons = [
    ...mine.map((c) => ({
      label: callButtonLabel(c),
      style: c.type === "win" ? "win" : "hot",
      onClick: () => { remember(); resolveWith(c); },
    })),
    { label: "패스", style: "ghost", onClick: () => { remember(); resolveWith(null); } },
  ];
  render(state);
}

function resolveWith(humanClaim) {
  const g = state.game;
  const claims = [];
  for (const p of g.players) {
    if (p.seat === state.human) continue;
    const mine = g.pending.calls.filter((c) => c.seat === p.seat);
    if (!mine.length) continue;
    const pick = state.bots[p.seat].call(p, mine);
    if (pick) claims.push(pick);
  }
  if (humanClaim) claims.push(humanClaim);
  resolveDiscard(g, claims);

  const last = g.log[g.log.length - 1];
  if (last?.type === "call" && last.call !== "win") {
    shoutCall(last.call, last.seat);
    table()?.meldTiles(last.seat, last.tiles, last.from, state.human);
    emote(last.seat, last.call === "chow" ? "chow" : "call");
    if (last.seat === state.human) emote(last.from, "robbed", { delay: 350 });
    const label = { pong: "펑", chow: "치", kong: "깡" }[last.call];
    say(
      withMnemonic(`${seatLabel(g, last.seat)}가 <b>${label}</b>했습니다.`, "locked"),
      `${seatLabel(g, last.seat)} ${label}`
    );
  }
  step();
}

function botTurn() {
  const g = state.game;
  const seat = g.turn;
  const bot = state.bots[seat];
  const p = g.players[seat];

  if (g.phase === PHASE.DRAW) {
    if (Math.random() < 0.15) emote(seat, "draw");
    table()?.drawTile(seat, state.human);
    draw(g);
    return step();
  }
  if (g.phase !== PHASE.DISCARD) return step();

  if (bot.wantsWin(p)) { declareWin(g, seat); return step(); }
  const tile = bot.discard(p, botContext(g, seat));
  state.subtitleTile = tile;
  say(`${seatLabel(g, seat)}가 <b>${tileName(tile)}</b>를 버렸습니다.`, `${seatLabel(g, seat)} → ${tileName(tile)}`);
  table()?.discardTile(seat, tile, state.human);
  discard(g, tile);
  step();
}

/* ── 외치기 — 치·펑·깡·완성은 입으로 선언한다 ─────────── */

let shoutTimer = null;

function shoutCall(kind, seat) {
  const spec = SHOUTS[kind];
  if (!spec) return;
  const cat = state.cats[seat];
  const who = seat === state.human ? "나" : (cat?.name ?? "");
  state.sound?.sfx?.shout?.(kind, { pitch: cat?.pitch ?? 1 });

  const el = document.getElementById("shout");
  el.innerHTML = `<div class="word">${spec.text}</div><div class="who">${who}</div>`;
  el.hidden = false;
  clearTimeout(shoutTimer);
  shoutTimer = setTimeout(() => { el.hidden = true; }, 1100);
}

/* ── 고양이 감정 표현 ───────────────────────────────── */

function emote(seat, kind, { delay = 0 } = {}) {
  const cat = state.cats[seat];
  const spec = emoteFor(kind);
  if (!cat || !spec) return;
  setTimeout(() => {
    state.emotes[seat] = { emoji: spec.emoji, text: spec.text };
    if (spec.meow) state.sound?.sfx?.meow?.(cat.pitch, cat.meowLen);
    render(state);
    setTimeout(() => {
      if (state.emotes[seat]?.emoji === spec.emoji) {
        delete state.emotes[seat];
        render(state);
      }
    }, 2400);
  }, delay);
}

/** 판이 시작되면 다 같이 인사한다 */
function greetCats() {
  let delay = 250;
  state.cats.forEach((cat, seat) => {
    if (!cat) return;
    emote(seat, "greet", { delay });
    delay += 650;
  });
}

/* ── 학습 모드 도구 ─────────────────────────────────── */

function updateCoach() {
  const g = state.game;
  if (!state.mode.coach || !g || g.phase === PHASE.WON || g.phase === PHASE.EXHAUSTED) {
    state.coach = null;
    return;
  }
  const me = g.players[state.human];
  state.coach = coachHand(me, { seen: seenCounts(g, state.human) });
}

function remember() {
  if (!state.mode.undo) return;
  state.undoStack.push(snapshotGame(state.game));
  if (state.undoStack.length > 20) state.undoStack.shift();
}

function undo() {
  const snap = state.undoStack.pop();
  if (!snap) return;
  clearTimeout(state.timer);
  state.pending = null;
  restoreGame(state.game, snap);
  table()?.rebuild(state.game, state.human, state.cats);
  state.picked = null;
  state.note = null;
  state.flash = "<b>한 수 물렸습니다.</b> 다시 골라 보세요.";
  step();
}

function updateTools() {
  const tools = [
    { label: state.mode === MODES.learn ? "🎓 학습" : "⚡ 실전", style: "chip", onClick: switchMode },
    { label: state.paused ? "▶ 계속" : "⏸ 멈춤", style: "chip", onClick: togglePause },
    { label: state.music ? "🎵" : "🎵̶", style: "chip", onClick: toggleMusic },
    { label: state.sfx ? "🔊" : "🔇", style: "chip", onClick: toggleSfx },
    { label: "?", style: "chip", onClick: helpSheet },
  ];
  const me = state.game?.players?.[state.human];
  if (me && me.autoSort === false) {
    tools.splice(1, 0, {
      label: "⇅ 정렬",
      style: "chip",
      onClick: () => {
        me.concealed = sortTiles(me.concealed);
        me.autoSort = true;
        state.flash = "다시 <b>자동 정렬</b>합니다. 길게 눌러 끌면 언제든 직접 배열로 바뀝니다.";
        step();
      },
    });
  }
  if (state.mode.undo) {
    tools.splice(1, 0, {
      label: "↩ 한 수",
      style: "chip",
      disabled: state.undoStack.length === 0,
      onClick: undo,
    });
  }
  state.tools = tools;
}

function toggleMusic() {
  state.music = state.sound ? state.sound.toggleMusic() : !state.music;
  updateTools();
  render(state);
}

function toggleSfx() {
  state.sfx = !state.sfx;
  state.sound?.setSfx(state.sfx);
  updateTools();
  render(state);
}

function switchMode() {
  state.mode = state.mode === MODES.learn ? MODES.real : MODES.learn;
  table()?.setSpeed(state.mode.speed);
  if (!state.mode.undo) state.undoStack = [];
  state.flash = `<b>${state.mode.name}</b>로 바꿨습니다.`;
  step();
}

function togglePause() {
  state.paused = !state.paused;
  if (!state.paused && state.pending) {
    const fn = state.pending;
    state.pending = null;
    return fn();
  }
  updateTools();
  render(state);
}

function helpSheet() {
  const rows = MNEMONICS.map(
    (m) => `<div class="row"><span>${m.title}</span><b class="mn">${m.line}</b></div>`
  ).join("");
  sheet(
    `<h2>연상 고리</h2>
     <p>외우지 말고 그림으로 기억하세요. 학습 모드에서는 상황마다 이 문장들이 자막에 따라붙습니다.</p>
     ${rows}`,
    [
      { label: "닫기", style: "hot", onClick: () => { hideSheet(); step(); } },
      { label: "기본 룰 다시 보기", style: "ghost", onClick: () => showRuleCard(0) },
    ]
  );
}

/* ── 판 끝 ──────────────────────────────────────────── */

function sheet(html, buttons, opts) {
  state.sheetButtons = buttons;
  showSheet(html, buttons, opts);
}

/* ── 기본 룰 카드 ───────────────────────────────────── */

/** 첫 시작 때 넘겨 보는 카드. 언제든 건너뛸 수 있다. */
function showRuleCard(index) {
  state.ruleCard = index;
  const total = RULE_CARDS.length;
  const last = index === total - 1;
  sheet(
    cardHTML(RULE_CARDS[index], index, total),
    [
      { label: index === 0 ? "건너뛰기" : "이전", style: "ghost", onClick: () => (index === 0 ? endRules() : showRuleCard(index - 1)) },
      { label: last ? "시작하기" : "다음", style: "hot", onClick: () => (last ? endRules() : showRuleCard(index + 1)) },
      ...(index === 0 || last ? [] : [{ label: "건너뛰기", style: "ghost", onClick: endRules }]),
    ],
    { row: true }
  );
}

function endRules() {
  state.ruleCard = null;
  if (state.game) { hideSheet(); return step(); }
  setupSheet();
}

function finishHand() {
  const g = state.game;
  const r = g.result;
  const t = table();
  if (r?.winner !== null && r?.winner !== undefined) {
    shoutCall("win", r.winner);
    emote(r.winner, "win");
    for (const pay of r.payments) emote(pay.from, "lose", { delay: 500 });
  } else if (r?.exhausted) {
    state.cats.forEach((cat, seat) => cat && emote(seat, "exhausted"));
  }
  if (t && r?.winner !== null && r?.winner !== undefined) {
    t.revealWin(
      [...g.players[r.winner].melds.map((m) => m.tiles), ...r.decomposition.sets.map((x) => x.tiles)],
      r.decomposition.pair
    );
    t.payment(r.payments, state.human);
  }
  const last = g.handNumber >= state.rounds;
  const showResult = () => sheet(resultSheet(g, state.human, state.mode.guide), [
    last
      ? { label: "최종 정산", style: "hot", onClick: showFinal }
      : { label: "다음 판", style: "hot", onClick: () => {
          const prevDealer = g.dealerIndex;
          const winner = g.result?.winner ?? null;
          nextHand(g);
          const who = (seat) => (seat === state.human ? "나" : state.cats[seat]?.name ?? `${seat}번`);
          state.flash =
            winner === null
              ? `무승부라 딜러는 <b>${who(g.dealerIndex)}</b> 그대로입니다.`
              : winner === prevDealer
                ? `딜러 <b>${who(prevDealer)}</b>가 이겨서 딜러를 유지합니다.`
                : `<b>${who(winner)}</b>가 이겨서 딜러가 오른쪽 <b>${who(g.dealerIndex)}</b>에게 넘어갑니다.`;
          hideSheet();
          ceremony();
        } },
  ]);
  if (t) setTimeout(showResult, 1400); else showResult();
}

function showFinal() {
  const g = state.game;
  const rows = g.result.totals
    .map((t) => `<div class="row"><span>${t.seat === state.human ? "나" : (state.cats[t.seat]?.name ?? "") + " 🐈"}
      <span class="dim">${seatLabel(g, t.seat)}</span></span>
      <b>${t.total}점 <span class="${t.delta >= 0 ? "pos" : "neg"}">${t.delta >= 0 ? "+" : ""}${t.delta}</span></b></div>`)
    .join("");
  sheet(
    `<h2>${state.rounds}판 정산</h2><p>손익 = 지금 산가지 − 시작액 ${g.bank.startingValue}점.</p>${rows}`,
    [
      { label: "환전하기 💰", style: "hot", onClick: exchangeScreen },
      { label: "새 게임", style: "ghost", onClick: setupSheet },
    ]
  );
}

/** 환전 화면 — 환율을 바꿔 가며 돈으로 본다 */
const RATES = [10, 100, 1000];

function exchangeScreen() {
  const g = state.game;
  const rate = state.setup.rate;
  const rateButtons = RATES.map((r) => `<button class="opt ${state.setup.rate === r ? "picked" : ""}"
    data-set="rate:${r}">10점=${r.toLocaleString("ko-KR")}원</button>`).join("");
  sheet(
    exchangeSheetHTML(g, state.cats, state.human, rate) +
      `<div class="optrow"><span class="optlabel">환율</span>${rateButtons}</div>`,
    [
      { label: "새 게임", style: "hot", onClick: setupSheet },
      { label: "정산으로", style: "ghost", onClick: showFinal },
    ]
  );
}

/* ── 시작 화면 ──────────────────────────────────────── */

function setupSheet() {
  const { playerCount, level, extendedBonuses, allowKong, scoring } = state.setup;
  const catLine = { 2: "포도가 상대합니다", 3: "감자·포도가 상대합니다", 4: "포도·감자·막내 셋 다 나옵니다" }[playerCount];
  const pick = (cond) => (cond ? "picked" : "");
  sheet(
    `<h2>대만마작 학습용 게임</h2>
     <p>손패 16장, 딜러 17장. <b>묶음 3장짜리 5개 + 짝 1개</b>를 만들면 이깁니다.</p>
     <div class="optrow"><span class="optlabel">인원</span>
       ${[2, 3, 4].map((n) => `<button class="opt ${pick(playerCount === n)}" data-set="playerCount:${n}">${n}인</button>`).join("")}
     </div>
     <p class="hint optnote">🐈 ${catLine} · ${playerCount === 4 ? "140장 전부" : playerCount === 3 ? "만자를 빼고 104장" : "만자·꽃을 빼고 100장"}</p>
     <div class="optrow"><span class="optlabel">봇 난이도</span>
       ${LEVEL_INFO.map((l) => `<button class="opt ${pick(level === l.key)}" data-set="level:${l.key}">${l.name}</button>`).join("")}
     </div>
     <p class="hint optnote">${LEVEL_INFO.find((l) => l.key === level).desc}</p>
     <div class="optrow"><span class="optlabel">규칙</span>
       <button class="opt ${pick(extendedBonuses)}" data-set="extendedBonuses:!">확장 보너스</button>
       <button class="opt ${pick(allowKong)}" data-set="allowKong:!">깡</button>
     </div>
     <p class="hint optnote">확장 보너스 = 混一色·碰碰胡·清一色·大三元… 익숙해지면 켜세요. 깡도 옵션입니다.</p>
     <div class="optrow"><span class="optlabel">점수</span>
       ${Object.keys(SCORING).map((k) => `<button class="opt ${pick(scoring === k)}" data-set="scoring:${k}">${k.replace("+", " / ")}</button>`).join("")}
     </div>
     <p class="hint optnote">${SCORING[scoring].label}</p>`,
    [
      {
        label: `<b>🎓 학습 모드</b><span>매 단계 자막 · 손패 코치 · 텐파이 표시 · 연상 고리 · 한 수 물리기</span>`,
        style: "card hot",
        onClick: () => newGame(MODES.learn),
      },
      {
        label: `<b>⚡ 실전 모드</b><span>힌트 없이 빠르게. 누가 무엇을 버렸는지만 알려줍니다.</span>`,
        style: "card",
        onClick: () => newGame(MODES.real),
      },
    ]
  );
}

/** 시작 화면의 옵션 버튼 */
function onSetupOption(button) {
  const [key, raw] = button.dataset.set.split(":");
  if (raw === "!") state.setup[key] = !state.setup[key];
  else state.setup[key] = ["playerCount", "rate"].includes(key) ? Number(raw) : raw;
  if (key === "rate") exchangeScreen();
  else setupSheet();
}

/* ── 입력 ───────────────────────────────────────────── */

function wait(ms, fn) {
  clearTimeout(state.timer);
  if (state.paused) { state.pending = fn; return; }
  state.timer = setTimeout(fn, ms);
}

function onClick(event) {
  const tool = event.target.closest("#toolbar button");
  if (tool) return state.tools[Number(tool.dataset.tool)]?.onClick?.();

  const actionBtn = event.target.closest("#actions button");
  if (actionBtn) return state.buttons[Number(actionBtn.dataset.idx)]?.onClick?.();

  const optBtn = event.target.closest("#overlay button.opt");
  if (optBtn) return onSetupOption(optBtn);

  const sheetBtn = event.target.closest("#overlay button");
  if (sheetBtn) return state.sheetButtons?.[Number(sheetBtn.dataset.sheet)]?.onClick?.();

  const tile = event.target.closest("#myHand .tile");
  if (tile && state.suppressClick) { state.suppressClick = false; return; }
  if (tile && state.game?.phase === PHASE.DISCARD && state.game.turn === state.human) {
    const index = Number(tile.dataset.index);
    if (state.picked?.index === index) return doDiscard();
    state.picked = { id: tile.dataset.tile, index };
    return humanTurn();
  }
}

/** 좌우로 밀어서도 넘길 수 있게 */
function swipe() {
  let startX = null;
  const overlay = document.getElementById("overlay");
  overlay.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    if (startX === null || state.ruleCard === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 45) return;
    const next = state.ruleCard + (dx < 0 ? 1 : -1);
    if (next < 0) return;
    if (next >= RULE_CARDS.length) return endRules();
    showRuleCard(next);
  }, { passive: true });
}

/* ── 손패 길게 눌러 재배열 ──────────────────────────── */

function handTiles() {
  return [...document.querySelectorAll("#myHand .tile")];
}

function startDrag(index, el) {
  state.drag = { index, moved: false };
  el.classList.add("dragging");
  navigator.vibrate?.(12);
}

function onPointerDown(e) {
  const tile = e.target.closest("#myHand .tile");
  if (!tile || !state.game) return;
  const index = Number(tile.dataset.index);
  clearTimeout(state.pressTimer);
  state.pressTimer = setTimeout(() => startDrag(index, tile), 260);
}

function onPointerMove(e) {
  if (!state.drag) return;
  e.preventDefault();
  const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#myHand .tile");
  if (!under) return;
  const target = Number(under.dataset.index);
  if (target === state.drag.index) return;
  const hand = state.game.players[state.human].concealed;
  const [moving] = hand.splice(state.drag.index, 1);
  hand.splice(target, 0, moving);
  state.drag.index = target;
  state.drag.moved = true;
  render(state);
  handTiles()[target]?.classList.add("dragging");
}

function onPointerUp() {
  clearTimeout(state.pressTimer);
  if (!state.drag) return;
  const moved = state.drag.moved;
  handTiles().forEach((el) => el.classList.remove("dragging"));
  state.drag = null;
  state.suppressClick = true; // 끌기 끝의 클릭이 '버리기 선택'으로 새지 않게
  if (moved) {
    const me = state.game.players[state.human];
    if (me.autoSort !== false) {
      me.autoSort = false;
      state.flash = "이제 <b>직접 배열</b>입니다 — 뽑은 패는 맨 오른쪽에 옵니다. 자동으로 돌아가려면 ⇅ 정렬.";
    }
    step();
  }
}

export function boot() {
  document.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { passive: false });
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  swipe();
  showRuleCard(0);
}

export { state };
