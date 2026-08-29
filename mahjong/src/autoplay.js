// 봇끼리 한 판을 끝까지 돌린다 — 콘솔 검증·테스트용 드라이버.

import { PHASE, draw, discard, resolveDiscard, declareWin, declareConcealedKong, actionsFor } from "./game.js";
import { makeBot, botContext } from "./bot.js";
import { CALL, concealedKongs } from "./calls.js";

export function playHand(game, { bots = null, maxSteps = 2000 } = {}) {
  const agents = bots || game.players.map(() => makeBot());
  let steps = 0;
  while (game.phase === PHASE.DRAW || game.phase === PHASE.DISCARD || game.phase === PHASE.CALLS) {
    if (steps++ > maxSteps) throw new Error("판이 끝나지 않는다 — 무한 루프");

    if (game.phase === PHASE.DRAW) {
      draw(game);
      continue;
    }

    if (game.phase === PHASE.DISCARD) {
      const seat = game.turn;
      const p = game.players[seat];
      if (agents[seat].wantsWin(p)) {
        declareWin(game, seat);
        continue;
      }
      if (game.options.allowKong) {
        const [kongTile] = concealedKongs(p.concealed);
        if (kongTile) {
          declareConcealedKong(game, seat, kongTile);
          if (game.phase !== PHASE.DISCARD) continue; // 보충하다 산이 떨어짐(유국)
        }
      }
      discard(game, agents[seat].discard(p, botContext(game, seat)));
      continue;
    }

    // 부르기 — 각자 부를지 말지 고르고 우선순위로 하나만 성립
    const claims = [];
    for (const p of game.players) {
      const mine = game.pending.calls.filter((c) => c.seat === p.seat);
      if (!mine.length) continue;
      const pick = agents[p.seat].call(p, mine);
      if (pick) claims.push(pick);
    }
    resolveDiscard(game, claims);
  }
  return game;
}

export { CALL, actionsFor };
