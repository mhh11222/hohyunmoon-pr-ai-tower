// 조작 — 규칙 엔진과 화면을 잇는다. 규칙 판단은 전부 엔진이 한다.

import {
  createGame, startHand, nextHand, draw, discard, resolveDiscard, declareWin, PHASE,
} from "../src/game.js";
import { makeBot } from "../src/bot.js";
import { isWinningHand } from "../src/hand.js";
import { tileName } from "../src/tiles.js";
import { render, showSheet, hideSheet, resultSheet, callButtonLabel, seatLabel } from "./view.js";

const BOT_DELAY = 700;   // 봇이 생각하는 척하는 시간
const CALL_DELAY = 420;

const state = {
  game: null,
  human: 0,
  bots: [],
  buttons: [],
  subtitle: "",
  picked: null,
  rounds: 4,
  timer: null,
};

/* ── 진행 ───────────────────────────────────────────── */

function newGame(playerCount = 2, rounds = 4) {
  state.rounds = rounds;
  state.game = createGame({ playerCount, seed: (Date.now() % 1e9) | 0 });
  state.bots = Array.from({ length: playerCount }, () => makeBot());
  startHand(state.game);
  hideSheet();
  announceDeal();
  step();
}

function announceDeal() {
  const g = state.game;
  const dice = g.log.find((e) => e.type === "dice");
  const flowers = g.log.find((e) => e.type === "flowers");
  state.subtitle =
    `<b>주사위 ${dice.dice.join("+")}=${dice.sum}</b> → 산의 입구를 정하고, 벽돌 2개(4장)씩 4바퀴 나눴습니다. ` +
    `손패 16장, 딜러만 17장.` +
    (flowers ? ` 꽃 ${flowers.events.length}장은 눕히고 담 뒤쪽에서 보충했습니다.` : "");
}

function step() {
  const g = state.game;
  state.buttons = [];

  if (g.phase === PHASE.WON || g.phase === PHASE.EXHAUSTED) {
    render(state);
    return finishHand();
  }

  if (g.phase === PHASE.CALLS) return handleCalls();
  if (g.turn === state.human) return humanTurn();

  render(state);
  wait(BOT_DELAY, botTurn);
}

function humanTurn() {
  const g = state.game;
  const me = g.players[state.human];

  if (g.phase === PHASE.DRAW) {
    state.subtitle = "<b>내 차례</b> — 먼저 한 장 뽑습니다. 한 턴은 들이쉬고(뽑고) → 내쉬고(버리고).";
    state.buttons = [{ label: "뽑기", style: "hot", onClick: () => { draw(g); step(); } }];
    return render(state);
  }

  if (state.picked) {
    state.subtitle = `<b>${tileName(state.picked)}</b>를 버릴까요? 버린 패는 되돌릴 수 없습니다.`;
    state.buttons = [
      { label: `${tileName(state.picked)} 버리기`, style: "hot", onClick: doDiscard },
      { label: "취소", style: "ghost", onClick: () => { state.picked = null; step(); } },
    ];
    return render(state);
  }

  if (isWinningHand(me.concealed, me.melds.length)) {
    state.subtitle = "<b>완성!</b> 묶음 5개 + 짝 1개가 다 됐습니다. 더 크게 먹으려면 패를 눌러 계속 갈 수도 있습니다.";
    state.buttons = [{ label: "완성!", style: "win", onClick: () => { declareWin(g, state.human); step(); } }];
    return render(state);
  }

  state.subtitle = "버릴 패를 고르세요. 외톨이 글자패·끝수(1·9)부터 버리는 게 정석입니다.";
  return render(state);
}

function doDiscard() {
  const tile = state.picked;
  state.picked = null;
  discard(state.game, tile);
  step();
}

function handleCalls() {
  const g = state.game;
  const mine = g.pending.calls.filter((c) => c.seat === state.human);
  const discarder = seatLabel(g, g.pending.from);

  if (!mine.length) {
    state.subtitle = `${discarder}가 <b>${tileName(g.pending.tile)}</b>를 버렸습니다.`;
    render(state);
    return wait(CALL_DELAY, () => resolveWith(null));
  }

  state.subtitle =
    `${discarder}가 버린 <b>${tileName(g.pending.tile)}</b> — 부를 수 있습니다. ` +
    "부르기는 의무가 아니라 선택입니다. 급하면 부르고, 크게 먹으려면 참습니다.";
  state.buttons = [
    ...mine.map((c) => ({
      label: callButtonLabel(c),
      style: c.type === "win" ? "win" : "hot",
      onClick: () => resolveWith(c),
    })),
    { label: "패스", style: "ghost", onClick: () => resolveWith(null) },
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

  const called = g.log[g.log.length - 1];
  if (called?.type === "call" && called.call !== "win") {
    state.subtitle = `${seatLabel(g, called.seat)}가 <b>${{ pong: "펑", chow: "치", kong: "깡" }[called.call]}</b>했습니다. 공개한 묶음은 잠겨서 다시 바꿀 수 없습니다.`;
  }
  step();
}

function botTurn() {
  const g = state.game;
  const seat = g.turn;
  const bot = state.bots[seat];
  const p = g.players[seat];

  if (g.phase === PHASE.DRAW) { draw(g); return step(); }
  if (g.phase !== PHASE.DISCARD) return step();

  if (bot.wantsWin(p)) { declareWin(g, seat); return step(); }
  const tile = bot.discard(p);
  state.subtitle = `${seatLabel(g, seat)}가 <b>${tileName(tile)}</b>를 버렸습니다.`;
  discard(g, tile);
  step();
}

/** 시트를 띄우면서 버튼 목록을 기억해 둔다 */
function sheet(html, buttons) {
  state.sheetButtons = buttons;
  showSheet(html, buttons);
}

function finishHand() {
  const g = state.game;
  const last = g.handNumber >= state.rounds;
  sheet(resultSheet(g, state.human), [
    last
      ? { label: "최종 정산", style: "hot", onClick: showFinal }
      : { label: "다음 판", style: "hot", onClick: () => { nextHand(g); hideSheet(); announceDeal(); step(); } },
  ]);
}

function showFinal() {
  const g = state.game;
  const rows = g.result.totals
    .map((t) => `<div class="row"><span>${seatLabel(g, t.seat)}${t.seat === state.human ? " (나)" : ""}</span>
      <b>${t.total}점 <span class="${t.delta >= 0 ? "pos" : "neg"}">${t.delta >= 0 ? "+" : ""}${t.delta}</span></b></div>`)
    .join("");
  sheet(
    `<h2>${state.rounds}판 정산</h2><p>손익 = 지금 산가지 − 시작액 ${g.bank.startingValue}점.</p>${rows}
     <p class="hint">환전(점수 → 돈) 화면은 STEP F에서 붙습니다.</p>`,
    [{ label: "새 게임", style: "hot", onClick: () => setupSheet() }]
  );
}

/* ── 시작 화면 ──────────────────────────────────────── */

function setupSheet() {
  sheet(
    `<h2>대만마작 학습용 게임</h2>
     <p>내 세트 기준입니다. 4인 140장 · 3인 104장(만자 빼고) · 2인 100장(만자·꽃 빼고).<br>
     손패 16장, 딜러 17장. <b>묶음 3장짜리 5개 + 짝 1개</b>를 만들면 이깁니다.</p>
     <p class="hint">STEP B는 2인 판입니다. 상대는 봇 1명, 3·4인은 STEP E에서 열립니다.</p>`,
    [{ label: "2인으로 시작", style: "hot", onClick: () => newGame(2, 4) }]
  );
}

/* ── 입력 ───────────────────────────────────────────── */

function wait(ms, fn) {
  clearTimeout(state.timer);
  state.timer = setTimeout(fn, ms);
}

function onClick(event) {
  const actionBtn = event.target.closest("#actions button");
  if (actionBtn) return state.buttons[Number(actionBtn.dataset.idx)]?.onClick?.();

  const sheetBtn = event.target.closest("#overlay button");
  if (sheetBtn) return state.sheetButtons?.[Number(sheetBtn.dataset.sheet)]?.onClick?.();

  const tile = event.target.closest("#myHand .tile");
  if (tile && state.game?.phase === PHASE.DISCARD && state.game.turn === state.human) {
    const id = tile.dataset.tile;
    if (state.picked === id) return doDiscard();
    state.picked = id;
    return humanTurn();
  }
}

export function boot() {
  document.addEventListener("click", onClick);
  setupSheet();
}

export { state };
