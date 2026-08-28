// 화면 그리기 — 게임 상태를 읽기만 하고 절대 바꾸지 않는다.

import { tileHTML, tilesHTML } from "./tileface.js";
import { SEATS, tileName } from "../src/tiles.js";
import { PHASE } from "../src/game.js";
import { mnemonic } from "./coach.js";
import { purseValue, exchange } from "../src/sticks.js";

const CALL_LABEL = { pong: "펑", chow: "치", kong: "깡", win: "완성!" };
const SEAT_KO = { east: "동", south: "남", west: "서", north: "북" };

export function seatLabel(game, seat) {
  const name = SEAT_KO[SEATS[seat]];
  const dealer = seat === game.dealerIndex ? " · 딜러" : "";
  return `${name}${dealer}`;
}

function sticksHTML(purse) {
  const parts = [];
  for (const v of [100, 50, 10]) {
    if (!purse[v]) continue;
    parts.push(`<span class="stick s${v}"></span><span>×${purse[v]}</span>`);
  }
  return `<span class="sticks">${parts.join("")}<b>${purseValue(purse)}점</b></span>`;
}

/** 고양이 아바타 + 감정 말풍선 */
function catHTML(state, seat) {
  const cat = state.cats?.[seat];
  if (!cat) return "";
  const emote = state.emotes?.[seat];
  const bubble = emote
    ? `<span class="bubble">${emote.emoji}${emote.text ? ` ${emote.text}` : ""}</span>`
    : "";
  return `<span class="avatar-wrap">${bubble}<img class="avatar" src="${cat.avatar}" alt="${cat.name}"></span>`;
}

function meldsHTML(player, { small = true } = {}) {
  const melds = player.melds
    .map((m) => `<span class="meld">${tilesHTML(m.tiles, { extraClass: small ? "small" : "" })}</span>`)
    .join("");
  const flowers = player.flowers.length
    ? `<span class="meld flowers">${tilesHTML(player.flowers, { extraClass: "small" })}</span>`
    : "";
  return melds || flowers ? `<div class="melds">${melds}${flowers}</div>` : "";
}

function riverHTML(player, latest) {
  const tiles = player.discards
    .map((t, i) => tileHTML(t, { extraClass: i === player.discards.length - 1 && latest ? "latest" : "" }))
    .join("");
  return `<div class="river">${tiles || '<span class="river-label">아직 버린 패 없음</span>'}</div>`;
}

export function render(state) {
  const { game, human } = state;
  const me = game.players[human];
  const opponents = game.players.filter((p) => p.seat !== human);

  document.getElementById("hud").textContent =
    `산 ${game.pile.length}장 · ${game.handNumber}판째`;

  document.getElementById("opponents").innerHTML = opponents
    .map((p) => state.use3D
      ? `<section class="seat slim ${game.turn === p.seat && game.phase !== PHASE.CALLS ? "active" : ""}">
          <div class="seat-head">
            ${catHTML(state, p.seat)}
            <span class="seat-name"><b>${state.cats?.[p.seat]?.name ?? "봇"}</b> <span class="dim">${seatLabel(game, p.seat)}</span> · 손패 ${p.concealed.length}장${
              p.melds.length ? ` · 공개 ${p.melds.length}묶음` : ""
            }${p.flowers.length ? ` · 꽃 ${p.flowers.length}` : ""}</span>
            ${sticksHTML(game.bank.players[p.seat])}
          </div>
        </section>`
      : `
      <section class="seat ${game.turn === p.seat && game.phase !== PHASE.CALLS ? "active" : ""}">
        <div class="seat-head">
          ${catHTML(state, p.seat)}
          <span class="seat-name"><b>${state.cats?.[p.seat]?.name ?? "봇"}</b> <span class="dim">${seatLabel(game, p.seat)}</span></span>
          ${sticksHTML(game.bank.players[p.seat])}
        </div>
        <div class="hand">${tilesHTML(p.concealed.map(() => "back"), { back: true, extraClass: "small" })}</div>
        ${meldsHTML(p)}
      </section>`)
    .join("");

  const dice = game.log.find((e) => e.type === "dice");
  const info = `<div class="wallinfo">
      <div><b>${game.pile.length}</b><span>산에 남은 패</span></div>
      <div><b>${dice ? dice.dice.join("+") : "-"}</b><span>주사위</span></div>
      <div><b>${game.handNumber}/${state.rounds}</b><span>판</span></div>
    </div>`;

  document.getElementById("center").innerHTML = info + opponents
    .map((p) => `<div class="river-label">${seatLabel(game, p.seat)}가 버린 패</div>${riverHTML(p, game.phase === PHASE.CALLS && game.pending?.from === p.seat)}`)
    .join("") + `<div class="river-label">내가 버린 패</div>${riverHTML(me, false)}`;

  document.getElementById("me").innerHTML = `
    <div class="seat-head">
      <span class="seat-name"><b>${seatLabel(game, human)}</b> 나</span>
      ${sticksHTML(game.bank.players[human])}
    </div>
    ${meldsHTML(me)}
    <div class="hand mine" id="myHand">${(state.handReveal == null
      ? me.concealed
      : me.concealed.slice(0, state.handReveal))
      .map((t, i) => tileHTML(t, { extraClass: state.picked?.index === i ? "pick" : "", index: i }))
      .join("")}</div>`;

  document.getElementById("me").classList.toggle(
    "active",
    game.turn === human && game.phase !== PHASE.CALLS
  );
  const chip = state.subtitleTile
    ? `<span class="subtile">${tileHTML(state.subtitleTile)}</span>`
    : "";
  document.getElementById("subtitle").innerHTML = `${chip}<span class="subtext">${state.subtitle || ""}</span>`;
  renderToolbar(state);
  renderCoach(state);
  renderActions(state);
}

function renderToolbar(state) {
  document.getElementById("toolbar").innerHTML = state.tools
    .map((t, i) => `<button class="${t.style || ""}" data-tool="${i}"${t.disabled ? " disabled" : ""}>${t.label}</button>`)
    .join("");
}

function renderCoach(state) {
  const box = document.getElementById("coach");
  if (!state.coach) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const waits = state.coach.tenpai
    ? `<div class="waits"><span>이 패가 오면 완성</span>${tilesHTML(state.coach.tenpai.waits, { extraClass: "small" })}</div>`
    : "";
  const note = state.note ? `<p class="note">${state.note}</p>` : "";
  box.innerHTML = `<div class="coach-head">🎓 손패 코치</div>
    ${state.coach.lines.map((l) => `<p>${l}</p>`).join("")}${waits}${note}`;
}

function renderActions(state) {
  const bar = document.getElementById("actions");
  bar.innerHTML = state.buttons
    .map((b, i) => `<button class="${b.style || ""}" data-idx="${i}">${b.label}</button>`)
    .join("");
}

export function callButtonLabel(call) {
  if (call.type === "chow") return `치 (${call.tiles.map(tileName).join("")})`;
  return CALL_LABEL[call.type] || call.type;
}

/** 완성 화면 */
/** 묶음 하나를 이름표와 함께 — 무엇이 계단이고 무엇이 세쌍둥이인지 눈에 보이게 */
function setBox(tiles, caption, open = false) {
  return `<span class="setbox ${open ? "open" : ""}">
    <span class="meld">${tilesHTML(tiles, { extraClass: "small" })}</span>
    <span class="cap">${caption}</span></span>`;
}

function setCaption(tiles) {
  return tiles[0] === tiles[1] && tiles[1] === tiles[2] ? "세쌍둥이" : "계단";
}

/** 완성 화면 */
export function resultSheet(game, human, guide = false) {
  const r = game.result;
  if (!r || r.winner === null || r.winner === undefined) {
    return `<h2>유국</h2><p>산이 떨어져 아무도 완성하지 못했습니다. 딜러는 그대로입니다.</p>
      ${totalsHTML(game, human)}`;
  }
  const winnerIsMe = r.winner === human;
  const how = r.isSelfDraw
    ? "<b>직접 뽑아</b> 이겼습니다 — 나머지 전원이 냅니다"
    : `${seatLabel(game, r.discarder)}가 버린 <b>${tileName(r.winningTile)}</b>로 이겼습니다 — 총 쏜 사람이 혼자 물어냅니다`;
  const { basePoint, bonusPoint } = game.options;
  const boxes = [
    ...game.players[r.winner].melds.map((m) => setBox(m.tiles, `${setCaption(m.tiles)} · 공개`, true)),
    ...r.decomposition.sets.map((st) => setBox(st.tiles, setCaption(st.tiles))),
    setBox(r.decomposition.pair, "짝"),
  ].join("");

  return `
    <h2>${winnerIsMe ? "완성! 🎉" : `${seatLabel(game, r.winner)} 완성`}</h2>
    <p>${how}</p>
    <div class="sets">${boxes}</div>
    <div class="row"><span>기본점</span><b>${basePoint}</b></div>
    ${r.bonuses.map((b) => `<div class="row"><span>${b.name} (보너스 ${b.value})</span><b>+${b.value * bonusPoint}</b></div>`).join("")}
    <div class="row"><span><b>받는 점수</b> — 보너스 ${r.bonusTotal}개</span><b>${r.value}점</b></div>
    ${r.payments.map((p) => `<div class="row"><span>${seatLabel(game, p.from)} → ${seatLabel(game, p.to)}</span><b>${p.amount}점</b></div>`).join("")}
    ${totalsHTML(game, human)}
    ${guide ? `<p class="hint">${mnemonic(r.isSelfDraw ? "bonus" : "ron").line}</p>` : ""}`;
}

function totalsHTML(game, human) {
  return `<div style="margin-top:10px">${game.result.totals
    .map((t) => `<div class="row"><span>${seatLabel(game, t.seat)}${t.seat === human ? " (나)" : ""}</span>
      <b>${t.total}점 <span class="${t.delta >= 0 ? "pos" : "neg"}">${t.delta >= 0 ? "+" : ""}${t.delta}</span></b></div>`)
    .join("")}</div>`;
}

/** 돈 표기 — 1,200원 / -300원 */
export function formatMoney(amount, currency = "원") {
  const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${sign}${Math.abs(amount).toLocaleString("ko-KR")}${currency}`;
}

/**
 * 환전 화면 — 산가지 손익을 돈으로 바꿔 보여 준다 (계산·표시만, 실제 결제 아님).
 * rate = 10점당 원. 순수 문자열 조립이라 테스트할 수 있다.
 */
export function exchangeSheetHTML(game, cats, human, rate) {
  const rows = exchange(game.bank, { pointsPerUnit: 10, moneyPerUnit: rate })
    .map((r) => {
      const name = r.seat === human ? "나" : (cats?.[r.seat]?.name ?? `${r.seat}번`);
      return `<div class="row"><span>${name}${cats?.[r.seat] ? " 🐈" : ""}</span>
        <b>${r.delta >= 0 ? "+" : ""}${r.delta}점 →
        <span class="${r.money >= 0 ? "pos" : "neg"}">${formatMoney(r.money)}</span></b></div>`;
    })
    .join("");
  return `
    <h2>환전 💰</h2>
    <p>산가지 손익을 돈으로 바꿔 봅니다. <b>10점 = ${rate.toLocaleString("ko-KR")}원</b>
    (계산·표시만, 실제 결제가 아닙니다).</p>
    ${rows}
    <p class="hint">환율은 아래 버튼으로 바꿀 수 있습니다. 손익 합계는 언제나 0이라
    누가 딴 만큼 누가 잃습니다.</p>`;
}

export function showSheet(html, buttons, { row = false } = {}) {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = `<div class="sheet">${html}<div class="actions${row ? " row" : ""}">${buttons
    .map((b, i) => `<button class="${b.style || ""}" data-sheet="${i}">${b.label}</button>`)
    .join("")}</div></div>`;
  overlay.classList.add("on");
}

export function hideSheet() {
  document.getElementById("overlay").classList.remove("on");
}
