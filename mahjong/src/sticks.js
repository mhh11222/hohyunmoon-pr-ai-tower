// 산가지 — 이 세트의 액면가와 개수
//
//   빨간 점 1개 = 10점  (22개)
//   검은 점 8개 = 50점  (21개)
//   빨간 점 5개 = 100점 (9개)   → 합계 52개 / 2,170점
//
// 남는 산가지는 가운데 "거스름돈 더미". 현금처럼 거슬러 준다.

export const DENOMS = [
  { value: 100, count: 9,  mark: "red5",   label: "빨간 점 5개" },
  { value: 50,  count: 21, mark: "black8", label: "검은 점 8개" },
  { value: 10,  count: 22, mark: "red1",   label: "빨간 점 1개" },
];

export const TOTAL_STICKS = DENOMS.reduce((n, d) => n + d.count, 0);   // 52
export const TOTAL_VALUE = DENOMS.reduce((n, d) => n + d.count * d.value, 0); // 2170

/** 인원별 1인 시작 배분 */
export const STARTING = {
  4: { 10: 5, 50: 5, 100: 2 },   // 500점
  3: { 10: 5, 50: 7, 100: 3 },   // 700점
  2: { 10: 10, 50: 10, 100: 4 }, // 1,000점
};

export function purseValue(purse) {
  return Object.entries(purse).reduce((sum, [v, n]) => sum + Number(v) * n, 0);
}

export function emptyPurse() {
  return { 10: 0, 50: 0, 100: 0 };
}

/** 인원수만큼 나눠주고 남은 건 거스름돈 더미로 */
export function createBank(playerCount) {
  const start = STARTING[playerCount];
  if (!start) throw new Error(`지원하지 않는 인원: ${playerCount}`);
  const players = Array.from({ length: playerCount }, () => ({ ...start }));
  const pot = emptyPurse();
  for (const d of DENOMS) pot[d.value] = d.count - start[d.value] * playerCount;
  for (const v of Object.values(pot)) {
    if (v < 0) throw new Error("산가지가 모자란다 — 배분표를 확인할 것");
  }
  return { players, pot, startingValue: purseValue(start) };
}

const VALUES = [100, 50, 10];

/** purse에서 정확히 amount를 만드는 조합 (없으면 null) */
export function exactCombo(purse, amount) {
  const search = (i, left, picked) => {
    if (left === 0) return picked;
    if (i >= VALUES.length) return null;
    const v = VALUES[i];
    const max = Math.min(purse[v] || 0, Math.floor(left / v));
    for (let n = max; n >= 0; n--) {
      const got = search(i + 1, left - n * v, { ...picked, [v]: n });
      if (got) return got;
    }
    return null;
  };
  return search(0, amount, emptyPurse());
}

/** purse에서 amount 이상을 만드는 조합 중 초과분이 가장 적은 것 */
export function payCombo(purse, amount) {
  let best = null;
  const search = (i, paid, picked) => {
    if (paid >= amount) {
      const over = paid - amount;
      const sticks = Object.values(picked).reduce((a, b) => a + b, 0);
      if (!best || over < best.over || (over === best.over && sticks < best.sticks)) {
        best = { combo: { ...picked }, over, sticks, paid };
      }
      return;
    }
    if (i >= VALUES.length) return;
    const v = VALUES[i];
    for (let n = 0; n <= (purse[v] || 0); n++) {
      search(i + 1, paid + n * v, { ...picked, [v]: n });
    }
  };
  search(0, 0, emptyPurse());
  return best;
}

function move(from, to, combo) {
  for (const [v, n] of Object.entries(combo)) {
    if (!n) continue;
    if ((from[v] || 0) < n) throw new Error(`산가지 부족: ${v}점 ${n}개`);
    from[v] -= n;
    to[v] = (to[v] || 0) + n;
  }
}

/**
 * 액면가는 그대로, 큰 산가지를 잔돈으로 바꾼다 (값이 같은 교환).
 * source는 가운데 더미일 수도, 다른 사람 지갑일 수도 있다 —
 * 실제로도 "누가 잔돈 좀 바꿔줘" 하고 아무하고나 바꾼다.
 */
function breakWith(purse, source, want) {
  for (const v of [100, 50]) {
    if (!purse[v]) continue;
    const from = { ...source };
    from[v] = 0; // 같은 액면가로 바꿔 봐야 소용없다
    const smaller = exactCombo(from, v);
    if (!smaller) continue;
    move(purse, source, { [v]: 1 });
    move(source, purse, smaller);
    if (!want || exactCombo(purse, want)) return true;
  }
  return false;
}

/** (호환용) 더미와 바꾸기 */
export function breakWithPot(bank, seat, want) {
  return breakWith(bank.players[seat], bank.pot, want);
}

/**
 * 산가지 옮기기. 액면가가 안 맞으면 크게 내고 거스름돈을 받는다 — 현금과 똑같이.
 * 거스름돈은 받는 사람이 내주고, 잔돈이 없으면 더미나 다른 사람과 값이 같게 바꾼다.
 * 어떤 경우든 총합은 변하지 않으므로 손익 합계는 언제나 0이다.
 * 반환: 애니메이션용 기록 { hand, change }
 */
export function transfer(bank, fromSeat, toSeat, amount) {
  if (amount <= 0) return { hand: emptyPurse(), change: emptyPurse() };
  const payer = bank.players[fromSeat];
  const receiver = bank.players[toSeat];
  if (purseValue(payer) < amount) {
    throw new Error(`${fromSeat}번 자리는 ${amount}점을 낼 산가지가 없다`);
  }

  // 잔돈 바꿀 상대 후보: 더미 먼저, 그다음 다른 사람들
  const sources = (skip) =>
    [bank.pot, ...bank.players.filter((_, i) => i !== fromSeat && i !== skip)];

  for (let attempt = 0; attempt < 6; attempt++) {
    const exact = exactCombo(payer, amount);
    if (exact) {
      move(payer, receiver, exact);
      return { hand: exact, change: emptyPurse() };
    }

    // 크게 내고 거스름돈 받기 — 거스름돈은 받은 사람이 (방금 받은 것 포함) 내준다
    const pay = payCombo(payer, amount);
    const after = emptyPurse();
    for (const v of VALUES) after[v] = (receiver[v] || 0) + (pay.combo[v] || 0);
    const change = exactCombo(after, pay.over);
    if (change) {
      move(payer, receiver, pay.combo);
      move(receiver, payer, change);
      return { hand: pay.combo, change };
    }

    // 아직 안 맞으면 낼 사람부터, 안 되면 받는 사람이 잔돈을 바꿔 온다
    let broke = false;
    for (const source of sources(toSeat)) {
      if (breakWith(payer, source, amount)) { broke = true; break; }
    }
    if (!broke) {
      for (const source of sources(fromSeat)) {
        if (breakWith(receiver, source, null)) { broke = true; break; }
      }
    }
    if (!broke) break;
  }
  throw new Error("산가지를 맞게 주고받을 수 없다");
}

/** 종료 정산 — 손익 = 지금 총점 − 시작액 */
export function settleUp(bank) {
  return bank.players.map((purse, seat) => ({
    seat,
    total: purseValue(purse),
    delta: purseValue(purse) - bank.startingValue,
  }));
}

/** 환전 — 점수 손익을 돈으로 (계산·표시만, 실제 결제 아님) */
export function exchange(bank, { pointsPerUnit = 10, moneyPerUnit = 100, currency = "원" } = {}) {
  return settleUp(bank).map((row) => ({
    ...row,
    money: (row.delta / pointsPerUnit) * moneyPerUnit,
    currency,
  }));
}
