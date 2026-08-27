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
import { tileName, SEATS } from "../src/tiles.js";
import { coachHand, tileNote, mnemonic, MNEMONICS } from "./coach.js";
import { RULE_CARDS, cardHTML } from "./rulecards.js";
import { seatCats, emoteFor } from "./cats.js";
import {
  render, showSheet, hideSheet, resultSheet, callButtonLabel, seatLabel, exchangeSheetHTML,
} from "./view.js";
import { createTable } from "./table3d.js";
import { createAudio } from "./sound.js";

export const MODES = {
  learn: { key: "learn", name: "학습 모드", guide: true, coach: true, undo: true, botDelay: 900, callDelay: 600 },
  real: { key: "real", name: "실전 모드", guide: false, coach: false, undo: false, botDelay: 420, callDelay: 260 },
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
  const stage = {
    shuffle: ["패를 섞습니다.", "섞는 중"],
    wall: ["<b>산(벽)</b>을 2단으로 쌓습니다. 산은 이어진 하나의 담입니다.", "산 쌓기"],
    dice: ["딜러가 <b>주사위</b>를 굴려 산의 입구를 정합니다.", "주사위"],
    deal: ["입구부터 <b>벽돌 2개(4장)씩</b> 4바퀴 — 손패 16장, 딜러만 17장.", "배패"],
  };
  state.buttons = [];
  await state.table.newHand(g, {
    humanSeat: state.human,
    onStage: (name) => {
      const [full, terse] = stage[name] || [];
      if (full) { say(full, terse); render(state); }
    },
  });
  announceDeal();
  greetCats();
  step();
}

function announceDeal() {
  const g = state.game;
  state.picked = null;
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

  if (!mine.length) {
    say(
      withMnemonic(`${who}가 <b>${tileName(g.pending.tile)}</b>를 버렸습니다.`, "river"),
      `${who} → ${tileName(g.pending.tile)}`
    );
    render(state);
    return wait(state.mode.callDelay, () => resolveWith(null));
  }

  say(
    withMnemonic(`${who}가 버린 <b>${tileName(g.pending.tile)}</b> — 부를 수 있습니다.`, "call"),
    `${who} → ${tileName(g.pending.tile)} · 부를 수 있습니다`
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
  say(`${seatLabel(g, seat)}가 <b>${tileName(tile)}</b>를 버렸습니다.`, `${seatLabel(g, seat)} → ${tileName(tile)}`);
  table()?.discardTile(seat, tile, state.human);
  discard(g, tile);
  step();
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
  table()?.rebuild(state.game, state.human);
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
      : { label: "다음 판", style: "hot", onClick: () => { nextHand(g); hideSheet(); ceremony(); } },
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

export function boot() {
  document.addEventListener("click", onClick);
  swipe();
  showRuleCard(0);
}

export { state };
