// 연속동작 시퀀스 — 프레임 보간, 자세 구간 자동 분할, 자세 정렬/비교. 순수 함수.
import { J, MOTION_JOINTS } from "./skeleton.js";
import { sub, add, scale, dot, cross, normalize, mid, dist, bodyFrame } from "./angles.js";

/** 두 랜드마크 배열을 선형 보간 */
export function lerpLandmarks(a, b, k) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = [
      a[i][0] + (b[i][0] - a[i][0]) * k,
      a[i][1] + (b[i][1] - a[i][1]) * k,
      a[i][2] + (b[i][2] - a[i][2]) * k,
    ];
  }
  return out;
}

/** t 이하인 마지막 프레임 인덱스 (이진 탐색) */
export function frameIndexAt(frames, t) {
  let lo = 0, hi = frames.length - 1;
  if (t <= frames[0].t) return 0;
  if (t >= frames[hi].t) return hi;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (frames[m].t <= t) lo = m; else hi = m;
  }
  return lo;
}

/** 시각 t의 랜드마크 (프레임 사이는 보간) */
export function frameAt(seq, t) {
  const frames = seq.frames;
  const i = frameIndexAt(frames, t);
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  if (a === b || b.t === a.t) return a.lm;
  const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  return lerpLandmarks(a.lm, b.lm, k);
}

export function duration(seq) {
  return seq.frames.length ? seq.frames[seq.frames.length - 1].t : 0;
}

/**
 * 프레임 i의 몸 움직임 속도 (m/s) — 보이는 큰 관절 중 빠른 3개의 평균.
 * 한 팔만 움직여도 잡히도록 평균이 아니라 상위값을 쓰고, (vis가 있으면) 안 보이는 관절의 떨림은 뺀다.
 */
export function speedAt(frames, i, { minVis = 0.5, top = 3 } = {}) {
  if (i <= 0 || i >= frames.length) return 0;
  const a = frames[i - 1], b = frames[i];
  const dt = b.t - a.t;
  if (dt <= 0) return 0;
  let ds = [];
  for (const j of MOTION_JOINTS) {
    if (a.vis && b.vis && (a.vis[j] < minVis || b.vis[j] < minVis)) continue;
    ds.push(dist(a.lm[j], b.lm[j]));
  }
  if (ds.length < 2) ds = MOTION_JOINTS.map((j) => dist(a.lm[j], b.lm[j]));
  ds.sort((x, y) => y - x);
  const k = Math.min(top, ds.length);
  let s = 0;
  for (let n = 0; n < k; n++) s += ds[n];
  return s / k / dt;
}

/** 정렬 후 q 분위수 */
export function percentile(values, q) {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))];
}

/** 이동 평균으로 속도 배열을 다듬는다 */
export function smoothSpeeds(speeds, radius = 2) {
  return speeds.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = i - radius; k <= i + radius; k++) {
      if (k >= 0 && k < speeds.length) { sum += speeds[k]; n++; }
    }
    return sum / n;
  });
}

/**
 * 멈춰 있는 구간(= 자세)을 찾는다.
 * 속도가 임계값 아래로 minHold(초) 이상 유지되면 하나의 자세.
 * 임계값은 기본적으로 영상 자체의 속도 분포에서 정한다(빠른 구간 95분위의 ratio 배, 최소 minSpeed):
 * 느리게 하는 사람과 빠르게 하는 사람 모두에서 "멈춤"이 잡히게.
 * 반환: [{start, end, key, startIndex, endIndex}] — key는 그 구간에서 가장 정지한 시각.
 */
export function segmentHolds(frames, { speedThreshold = null, ratio = 0.1, minSpeed = 0.06, minHold = 0.35, smoothRadius = 2 } = {}) {
  if (frames.length < 2) return [];
  const raw = frames.map((_, i) => speedAt(frames, i));
  raw[0] = raw[1] ?? 0;
  const speeds = smoothSpeeds(raw, smoothRadius);
  if (speedThreshold == null) speedThreshold = Math.max(minSpeed, ratio * percentile(speeds, 0.95));
  const holds = [];
  let runStart = -1;
  const flush = (endIdx) => {
    if (runStart < 0) return;
    const start = frames[runStart].t, end = frames[endIdx].t;
    if (end - start >= minHold) {
      let best = runStart;
      for (let k = runStart; k <= endIdx; k++) if (speeds[k] < speeds[best]) best = k;
      holds.push({ start, end, key: frames[best].t, startIndex: runStart, endIndex: endIdx });
    }
    runStart = -1;
  };
  for (let i = 0; i < frames.length; i++) {
    if (speeds[i] < speedThreshold) {
      if (runStart < 0) runStart = i;
    } else {
      flush(i - 1);
    }
  }
  flush(frames.length - 1);
  return holds;
}

/** t가 속한 자세 인덱스. 구간 사이(전환 중)면 가장 가까운 앞 자세 */
export function poseIndexAt(seq, t) {
  const poses = seq.poses;
  if (!poses.length) return -1;
  for (let i = 0; i < poses.length; i++) {
    if (t >= poses[i].start && t <= poses[i].end) return i;
  }
  let best = 0;
  for (let i = 0; i < poses.length; i++) if (poses[i].key <= t) best = i;
  return best;
}

/** i번째 자세 → i+1번째 자세로 넘어가는 구간 */
export function transitionOf(seq, i) {
  const from = seq.poses[i], to = seq.poses[i + 1];
  if (!from || !to) return null;
  return { index: i, from, to, start: from.key, end: to.key };
}

/**
 * 자세를 몸 기준으로 정규화: 골반 중심을 원점으로, 몸통 길이를 1로, 어깨선이 x축을 보게.
 * 카메라 위치·키·서 있는 방향이 달라도 같은 자세면 같은 값이 나오게 한다.
 */
export function normalizePose(lm) {
  const f = bodyFrame(lm);
  const s = 1 / f.torso;
  return lm.map((p) => {
    const d = sub(p, f.origin);
    return [dot(d, f.left) * s, dot(d, f.up) * s, dot(d, f.forward) * s];
  });
}

/** 정규화 후 관절 위치 평균 거리. 0에 가까울수록 같은 자세 */
export function poseDistance(a, b, joints = MOTION_JOINTS) {
  const na = normalizePose(a), nb = normalizePose(b);
  let s = 0;
  for (const j of joints) s += dist(na[j], nb[j]);
  return s / joints.length;
}

/**
 * ref(책 자세)를 cur(현재 프레임) 위에 겹칠 수 있게 옮긴다:
 * ref를 정규화한 뒤 cur의 몸 기준틀·몸통 길이로 되돌린다.
 */
export function alignToPose(ref, cur) {
  const f = bodyFrame(cur);
  const n = normalizePose(ref);
  return n.map((p) => add(f.origin, add(add(scale(f.left, p[0] * f.torso), scale(f.up, p[1] * f.torso)), scale(f.forward, p[2] * f.torso))));
}

/**
 * 책 사진(ref 자세 목록)을 정지 구간(holds)에 순서를 지키며 붙인다. (단조 DP)
 * 반환: refs 각각에 대응하는 holds 인덱스 (없으면 -1).
 */
export function assignRefsToHolds(refLms, holdLms) {
  const n = refLms.length, m = holdLms.length;
  if (!n || !m) return new Array(n).fill(-1);
  const INF = 1e9;
  const cost = refLms.map((r) => holdLms.map((h) => poseDistance(r, h)));
  // dp[i][j] = refs[0..i) 를 holds[0..j) 에 단조 배정했을 때 최소 비용 (ref 하나당 hold 하나, hold는 여러 ref 불가)
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const choice = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  for (let j = 0; j <= m; j++) dp[0][j] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // hold j-1 을 건너뛰기
      if (dp[i][j - 1] < dp[i][j]) { dp[i][j] = dp[i][j - 1]; choice[i][j] = choice[i][j - 1]; }
      // ref i-1 을 hold j-1 에 배정
      const c = dp[i - 1][j - 1] + cost[i - 1][j - 1];
      if (c < dp[i][j]) { dp[i][j] = c; choice[i][j] = j - 1; }
    }
  }
  const out = new Array(n).fill(-1);
  let j = m;
  for (let i = n; i >= 1; i--) {
    const h = choice[i][j];
    if (h < 0) break;
    out[i - 1] = h;
    j = h;
  }
  return out;
}

/** 자세가 하나도 없을 때(파이프라인 전) 자동 분할로 임시 자세 목록을 만든다 */
export function autoPoses(seq, opts) {
  return segmentHolds(seq.frames, opts).map((h, i) => ({
    id: `auto${String(i + 1).padStart(2, "0")}`,
    name: `자세 ${i + 1}`,
    zh: "",
    start: h.start, end: h.end, key: h.key,
    desc: "자동 분할된 자세입니다. poses.json에 이름과 책 설명을 적어 주세요.",
    cues: [],
    image: null,
    ref: null,
  }));
}

/** 시퀀스 무결성 검사 — 데이터 파일이 잘못 생성됐을 때 빨리 알아채기 위해 */
export function validateSequence(seq) {
  const problems = [];
  if (!Array.isArray(seq.frames) || seq.frames.length < 2) problems.push("frames가 2개 미만");
  for (let i = 0; i < seq.frames.length; i++) {
    const f = seq.frames[i];
    if (!Array.isArray(f.lm) || f.lm.length !== 33) { problems.push(`frame ${i}: 랜드마크 33개가 아님`); break; }
    if (i > 0 && f.t < seq.frames[i - 1].t) { problems.push(`frame ${i}: 시간이 역행`); break; }
  }
  for (const p of seq.poses ?? []) {
    if (!(p.start <= p.key && p.key <= p.end)) problems.push(`pose ${p.id}: key가 start~end 밖`);
    if (p.ref && p.ref.length !== 33) problems.push(`pose ${p.id}: ref 랜드마크 33개가 아님`);
  }
  return problems;
}

export { J, mid, cross, normalize };
