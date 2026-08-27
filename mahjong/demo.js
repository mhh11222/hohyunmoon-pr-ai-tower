// STEP A 검증용 콘솔 데모: node mahjong/demo.js [인원] [시드] [판수]
//
// 규칙 엔진만으로 한 판을 끝까지 돌리고, 정석 절차를 그대로 찍어 준다.

import { createGame, startHand, nextHand, PHASE, waitsFor } from "./src/game.js";
import { playHand } from "./src/autoplay.js";
import { tileName, sortTiles, SEATS } from "./src/tiles.js";
import { purseValue } from "./src/sticks.js";
import { DECK_SIZE } from "./src/deck.js";

const playerCount = Number(process.argv[2] || 4);
const seed = Number(process.argv[3] || 20260827);
const hands = Number(process.argv[4] || playerCount);

const show = (tiles) => sortTiles(tiles).map(tileName).join(" ");
const seat = (i) => `${i}번(${SEATS[i]})`;

const game = createGame({ playerCount, seed, options: { extendedBonuses: true } });
console.log(`■ ${playerCount}인 대만마작 — 덱 ${DECK_SIZE[playerCount]}장, 시드 ${seed}`);
console.log(`  시작 산가지: 1인 ${game.bank.startingValue}점, 거스름돈 더미 ${purseValue(game.bank.pot)}점\n`);

startHand(game);
for (let h = 1; h <= hands; h++) {
  if (h > 1) nextHand(game);
  console.log(`── ${h}판 (딜러 ${seat(game.dealerIndex)}) ─────────────`);
  for (const e of game.log) {
    if (e.type === "shuffle") console.log(`  섞기: ${e.count}장${e.excluded.length ? ` (뺀 무늬: ${e.excluded.join(",")})` : ""}`);
    if (e.type === "wall") console.log(`  산 쌓기: 벽 ${e.wallCount}개, 벽돌 ${e.stacks.join("/")}개 (2단)`);
    if (e.type === "dice") console.log(`  주사위 ${e.dice.join("+")}=${e.sum} → ${e.opening.wallIndex}번 벽 ${e.opening.stackIndex}번 벽돌이 입구`);
    if (e.type === "deal") console.log(`  배패: ${e.sizes.join("/")}장 (딜러만 17장)`);
    if (e.type === "flowers") console.log(`  꽃 처리: ${e.events.map((x) => `${seat(x.seat)} ${tileName(x.flower)}→보충`).join(", ")}`);
  }
  game.players.forEach((p) => {
    console.log(`  ${seat(p.seat)} 손패 ${p.concealed.length}장: ${show(p.concealed)}${p.flowers.length ? `  [꽃 ${p.flowers.map(tileName).join("")}]` : ""}`);
  });

  const before = game.log.length;
  playHand(game);

  let turns = 0;
  const CALL_LABEL = { pong: "펑", chow: "치", kong: "깡", win: "완성" };
  for (const e of game.log.slice(before)) {
    if (e.type === "discard") turns++;
    if (e.type === "call" && e.call !== "win") {
      console.log(`  ▸ ${seat(e.seat)} ${CALL_LABEL[e.call] ?? ""}`);
    }
  }
  console.log(`  버림 ${turns}수, 남은 산 ${game.pile.length}장`);

  if (game.phase === PHASE.WON) {
    const r = game.result;
    console.log(`  ★ ${seat(r.winner)} 완성! ${r.isSelfDraw ? "직접 뽑아" : `${seat(r.discarder)}가 버린 ${tileName(r.winningTile)}로`}`);
    console.log(`    ${r.decomposition.sets.map((s) => s.tiles.map(tileName).join("")).join(" / ")} + 짝 ${r.decomposition.pair.map(tileName).join("")}`);
    if (r.melds.length) console.log(`    공개 묶음: ${r.melds.map((m) => m.tiles.map(tileName).join("")).join(" / ")}`);
    console.log(`    보너스: ${r.bonuses.map((b) => `${b.name} +${b.value}`).join(", ") || "없음"} → 합 ${r.bonusTotal}`);
    console.log(`    점수: ${r.value}점  |  ${r.payments.map((p) => `${seat(p.from)}→${seat(p.to)} ${p.amount}`).join(", ")}`);
  } else {
    console.log("  ─ 유국 (산이 떨어짐)");
  }
  console.log(`  산가지: ${game.result.totals.map((t) => `${seat(t.seat)} ${t.total}(${t.delta >= 0 ? "+" : ""}${t.delta})`).join("  ")}\n`);
}

const total = game.bank.players.reduce((s, p) => s + purseValue(p), 0) + purseValue(game.bank.pot);
console.log(`■ 산가지 총합 검증: ${total}점 (항상 2170이어야 함)`);
