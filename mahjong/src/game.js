// 판 진행 — 규칙 엔진의 상태 기계. 렌더링은 전혀 하지 않는다.
//
// 한 턴 리듬: 뽑고(들이쉬고) → 버리고(내쉬고).
// 펑·치로 가져왔으면 뽑기를 건너뛰고 바로 버린다.

import { SEATS, isFlower, sortTiles } from "./tiles.js";
import { makeRng, rollDice } from "./rng.js";
import { shuffleDeck, excludedSuits } from "./deck.js";
import { openWall, dealHands, resolveFlowers, WALL_COUNT } from "./wall.js";
import { decompose, isWinningHand, waitingTiles } from "./hand.js";
import { availableCalls, resolveCalls, rightOf, CALL } from "./calls.js";
import { DEFAULT_OPTIONS, scoreWin } from "./score.js";
import { createBank, transfer, settleUp } from "./sticks.js";

export const PHASE = {
  SETUP: "setup",
  DRAW: "draw",       // 현재 차례가 뽑을 차례
  DISCARD: "discard", // 현재 차례가 버릴 차례
  CALLS: "calls",     // 방금 버려진 패에 대한 부르기 대기
  WON: "won",
  EXHAUSTED: "exhausted", // 유국
};

function emit(game, type, payload = {}) {
  game.log.push({ type, ...payload });
  return game.log[game.log.length - 1];
}

/**
 * 새 게임(한 바퀴) 시작 — 산가지 은행까지 세팅.
 * dealerIndex를 안 주면 실제처럼 주사위를 굴려 첫 딜러를 뽑는다:
 * 0번 자리(나)부터 반시계로 주사위 합만큼 센 자리가 딜러.
 */
export function createGame({ playerCount = 4, seed = 1, dealerIndex = null, options = {} } = {}) {
  if (![2, 3, 4].includes(playerCount)) throw new Error("2·3·4인만 지원한다");
  const rng = makeRng(seed);
  let dealerRoll = null;
  if (dealerIndex === null || dealerIndex === undefined) {
    dealerRoll = rollDice(rng);
    dealerIndex = (dealerRoll.sum - 1) % playerCount; // 나를 1로 세기 시작
  }
  return {
    playerCount,
    dealerIndex,
    dealerRoll,
    options: { ...DEFAULT_OPTIONS, ...options },
    rng,
    bank: createBank(playerCount),
    handNumber: 0,
    phase: PHASE.SETUP,
    log: [],
    history: [],
  };
}

/** 한 판 배패까지 — 섞기 → 산 쌓기 → 주사위 → 입구 → 배패 → 꽃 처리 */
export function startHand(game) {
  const { playerCount, dealerIndex } = game;
  game.handNumber += 1;
  game.log = [];

  const deck = shuffleDeck(playerCount, game.rng);
  emit(game, "shuffle", { count: deck.length, excluded: excludedSuits(playerCount) });

  const { walls, dice, sum, opening, drawPile } = openWall(deck, playerCount, dealerIndex, game.rng);
  emit(game, "wall", { wallCount: WALL_COUNT[playerCount], stacks: walls.map((w) => w.length) });
  emit(game, "dice", { dice, sum, opening });

  const { hands, pile } = dealHands(drawPile, playerCount, dealerIndex);
  game.pile = pile;
  game.players = hands.map((tiles, seat) => ({
    seat,
    seatName: SEATS[seat],
    concealed: sortTiles(tiles),
    melds: [],
    flowers: [],
    discards: [],
  }));
  emit(game, "deal", { sizes: hands.map((h) => h.length) });

  const handTiles = game.players.map((p) => p.concealed);
  const { flowers, events } = resolveFlowers(handTiles, game.pile, dealerIndex);
  game.players.forEach((p, seat) => {
    p.flowers = flowers[seat];
    p.concealed = sortTiles(handTiles[seat]);
  });
  if (events.length) emit(game, "flowers", { events });

  game.turn = dealerIndex;
  game.pending = null;
  game.lastDraw = null;
  game.result = null;
  game.phase = PHASE.DISCARD; // 딜러는 17장 — 첫 패를 버리며 시작
  emit(game, "handStart", { dealer: dealerIndex, hand: game.handNumber });
  return game;
}

export function player(game, seat) {
  return game.players[seat];
}

/** 지금 이 자리가 할 수 있는 것들 (UI 버튼 노출용) */
export function actionsFor(game, seat) {
  if (game.phase === PHASE.DRAW && game.turn === seat) return [{ type: "draw" }];
  if (game.phase === PHASE.DISCARD && game.turn === seat) {
    const p = player(game, seat);
    const acts = [{ type: "discard", tiles: discardable(game, seat) }];
    if (isWinningHand(p.concealed, p.melds.length)) acts.unshift({ type: CALL.WIN, selfDraw: true });
    return acts;
  }
  if (game.phase === PHASE.CALLS) {
    const mine = game.pending.calls.filter((c) => c.seat === seat);
    if (mine.length) return [...mine, { type: "pass" }];
  }
  return [];
}

/** 공개한 묶음은 잠금 — 버릴 수 있는 건 손 안의 패뿐 */
export function discardable(game, seat) {
  return sortTiles(player(game, seat).concealed);
}

/** 뽑기 — 꽃이 나오면 눕히고 담 뒤쪽에서 보충 */
export function draw(game) {
  if (game.phase !== PHASE.DRAW) throw new Error(`뽑을 차례가 아니다 (${game.phase})`);
  const seat = game.turn;
  const p = player(game, seat);
  let tile = game.pile.shift();
  if (tile === undefined) return exhaust(game);

  while (isFlower(tile)) {
    p.flowers.push(tile);
    emit(game, "flower", { seat, flower: tile });
    const replacement = game.pile.pop();
    if (replacement === undefined) return exhaust(game);
    tile = replacement;
  }

  p.concealed = p.autoSort === false ? [...p.concealed, tile] : sortTiles([...p.concealed, tile]);
  game.lastDraw = { seat, tile };
  game.phase = PHASE.DISCARD;
  emit(game, "draw", { seat, tile, left: game.pile.length });
  return game;
}

/** 버리기 — 버린 패는 되돌릴 수 없다 */
export function discard(game, tile) {
  if (game.phase !== PHASE.DISCARD) throw new Error(`버릴 차례가 아니다 (${game.phase})`);
  const seat = game.turn;
  const p = player(game, seat);
  const at = p.concealed.indexOf(tile);
  if (at < 0) throw new Error(`손에 없는 패는 못 버린다: ${tile}`);
  p.concealed.splice(at, 1);
  p.discards.push(tile);
  emit(game, "discard", { seat, tile });

  const calls = availableCalls(
    game.players.map((q) => ({ seat: q.seat, concealed: q.concealed, melds: q.melds })),
    tile,
    seat,
    { allowKong: game.options.allowKong }
  );
  game.pending = { tile, from: seat, calls };
  game.phase = PHASE.CALLS;
  if (calls.length === 0) return resolveDiscard(game, []);
  return game;
}

/**
 * 부르기 판정. claims는 실제로 부르겠다고 한 것들 (부르기는 선택이지 의무가 아니다).
 * 아무도 안 부르면 다음 사람 차례.
 */
export function resolveDiscard(game, claims = []) {
  if (game.phase !== PHASE.CALLS) throw new Error("부르기 단계가 아니다");
  const { tile, from } = game.pending;
  const legal = claims.filter((c) =>
    game.pending.calls.some(
      (k) => k.seat === c.seat && k.type === c.type && k.tiles.join() === c.tiles.join()
    )
  );
  const winner = resolveCalls(legal, from, game.playerCount);
  game.pending = null;

  if (!winner) {
    game.phase = PHASE.DRAW;
    game.turn = rightOf(from, game.playerCount);
    if (game.pile.length === 0) return exhaust(game);
    return game;
  }

  const p = player(game, winner.seat);
  // 방금 버려진 그 한 장만 가져올 수 있다
  player(game, from).discards.pop();

  if (winner.type === CALL.WIN) {
    emit(game, "call", { seat: winner.seat, call: CALL.WIN, tile, from });
    return declareWin(game, winner.seat, { tile, from });
  }

  const taken = winner.tiles.slice();
  taken.splice(taken.indexOf(tile), 1); // 부른 그 한 장은 버림패에서 온다
  for (const t of taken) {
    const at = p.concealed.indexOf(t);
    if (at < 0) throw new Error(`부르기에 쓸 패가 없다: ${t}`);
    p.concealed.splice(at, 1);
  }
  p.melds.push({ type: winner.type, tiles: winner.tiles.slice(), from, locked: true });
  emit(game, "call", { seat: winner.seat, call: winner.type, tiles: winner.tiles, from });

  game.turn = winner.seat;
  if (winner.type === CALL.KONG) {
    const replacement = game.pile.pop();
    if (replacement === undefined) return exhaust(game);
    p.concealed = sortTiles([...p.concealed, replacement]);
    emit(game, "kongReplacement", { seat: winner.seat, tile: replacement });
  }
  game.phase = PHASE.DISCARD; // 가져왔으면 뽑기 없이 바로 버린다
  return game;
}

/** 완성 선언 — 직접 뽑아 이기거나, 버려진 패로 이기거나 */
export function declareWin(game, seat, byDiscard = null) {
  const p = player(game, seat);
  const concealed = byDiscard ? [...p.concealed, byDiscard.tile] : p.concealed;
  const decomposition = decompose(concealed, p.melds.length);
  if (!decomposition) throw new Error("완성형이 아니다");

  const score = scoreWin({
    seat: windOf(game, seat),
    melds: p.melds,
    decomposition,
    flowers: p.flowers,
    isSelfDraw: !byDiscard,
    options: game.options,
    winnerIndex: seat,
    discarderIndex: byDiscard ? byDiscard.from : null,
    playerCount: game.playerCount,
  });

  const moves = score.payments.map((pay) => ({
    ...pay,
    sticks: transfer(game.bank, pay.from, pay.to, pay.amount),
  }));

  game.phase = PHASE.WON;
  game.result = {
    winner: seat,
    isSelfDraw: !byDiscard,
    discarder: byDiscard ? byDiscard.from : null,
    winningTile: byDiscard ? byDiscard.tile : game.lastDraw?.tile,
    decomposition,
    melds: p.melds,
    flowers: p.flowers,
    ...score,
    moves,
    totals: settleUp(game.bank),
  };
  emit(game, "win", game.result);
  return game;
}

function exhaust(game) {
  game.phase = PHASE.EXHAUSTED;
  game.result = { winner: null, exhausted: true, totals: settleUp(game.bank) };
  emit(game, "exhausted", {});
  return game;
}

/** 딜러 승계 — 딜러가 이기거나 유국이면 유지, 남이 이기면 오른쪽으로 */
export function nextHand(game) {
  const won = game.result?.winner;
  game.history.push({ hand: game.handNumber, dealer: game.dealerIndex, result: game.result });
  if (won !== null && won !== undefined && won !== game.dealerIndex) {
    game.dealerIndex = rightOf(game.dealerIndex, game.playerCount);
  }
  return startHand(game);
}

/**
 * 한 수 물리기용 스냅샷. 난수 함수만 빼고 통째로 복사한다.
 * 판이 시작된 뒤에는 난수를 쓰지 않으므로 되돌려도 결과가 어긋나지 않는다.
 */
export function snapshotGame(game) {
  const { rng, ...rest } = game;
  return structuredClone(rest);
}

export function restoreGame(game, snap) {
  for (const key of Object.keys(snap)) game[key] = structuredClone(snap[key]);
  return game;
}

/**
 * 그 자리의 현재 방위 — 딜러가 東이고 반시계로 南西北.
 * 자리 꽃(동=春…)과 門風도 이 방위를 따른다. 딜러가 넘어가면 방위도 돈다.
 */
export function windOf(game, seat) {
  return SEATS[(seat - game.dealerIndex + game.playerCount) % game.playerCount];
}

/** 학습 모드용 — 지금까지 보이는 패로 대기패 계산 */
export function seenCounts(game, seat) {
  const seen = {};
  const bump = (t) => { if (!isFlower(t)) seen[t] = (seen[t] || 0) + 1; };
  player(game, seat).concealed.forEach(bump);
  for (const p of game.players) {
    p.discards.forEach(bump);
    p.melds.forEach((m) => m.tiles.forEach(bump));
  }
  return seen;
}

export function waitsFor(game, seat) {
  const p = player(game, seat);
  return waitingTiles(p.concealed, p.melds.length, { seen: seenCounts(game, seat) });
}
