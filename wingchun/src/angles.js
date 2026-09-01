// 관절 각도 — 순수 함수. 3D 뷰어와 테스트가 같이 쓴다.
import { J } from "./skeleton.js";

const RAD = 180 / Math.PI;

export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a) { return Math.hypot(a[0], a[1], a[2]); }
export function normalize(a) {
  const l = length(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
}
export function mid(a, b) { return scale(add(a, b), 0.5); }
export function dist(a, b) { return length(sub(a, b)); }

const EPS = 1e-6;

/** 두 벡터 사이 각(도). 어느 한쪽이 영벡터(관절이 겹침)면 null — 그럴듯한 숫자 대신 "모름" */
export function angleBetween(u, v) {
  if (length(u) < EPS || length(v) < EPS) return null;
  const d = dot(normalize(u), normalize(v));
  return Math.acos(Math.max(-1, Math.min(1, d))) * RAD;
}

/** 꼭짓점 b에서 a·c가 이루는 각(도). 팔꿈치·무릎 등 */
export function angleAt(a, b, c) {
  return angleBetween(sub(a, b), sub(c, b));
}

/**
 * 몸 기준 좌표틀. 골반 중심이 원점, x = 본인의 왼쪽, y = 위, z = 앞.
 * 사람이 카메라를 향해 서 있지 않아도 "몸 기준" 각을 낼 수 있게 한다.
 */
export function bodyFrame(lm) {
  const hipC = mid(lm[J.left_hip], lm[J.right_hip]);
  const shC = mid(lm[J.left_shoulder], lm[J.right_shoulder]);
  const up = normalize(sub(shC, hipC));
  let left = normalize(sub(lm[J.left_hip], lm[J.right_hip]));
  // up에 직교하도록 보정
  left = normalize(sub(left, scale(up, dot(left, up))));
  const forward = normalize(cross(left, up));
  return { origin: hipC, left, up, forward, torso: dist(shC, hipC) || 1 };
}

/** 점을 몸 기준 좌표로 변환 */
export function toBody(p, frame) {
  const d = sub(p, frame.origin);
  return [dot(d, frame.left), dot(d, frame.up), dot(d, frame.forward)];
}

/** 벡터가 수평면과 이루는 각(도). +면 위로 향함 */
export function elevation(v, frame) {
  if (length(v) < EPS) return null;
  const n = normalize(v);
  return Math.asin(Math.max(-1, Math.min(1, dot(n, frame.up)))) * RAD;
}

/** 벡터를 수평면에 투영했을 때 "앞" 방향에서 왼쪽(+)/오른쪽(-)으로 벗어난 각(도) */
export function yaw(v, frame) {
  if (length(v) < EPS) return null;
  const x = dot(v, frame.left);
  const z = dot(v, frame.forward);
  return Math.atan2(x, z) * RAD;
}

/**
 * 각도 정의. 세 점(a-b-c)이면 b가 꼭짓점.
 * kind: "joint"(세 점 각) | "elev"(수평 대비) | "yaw"(중심선 대비) | "offset"(중심선에서 떨어진 거리 cm)
 */
export const ANGLE_DEFS = [
  { key: "l_elbow", label: "왼팔꿈치", side: "left", kind: "joint", a: J.left_shoulder, b: J.left_elbow, c: J.left_wrist },
  { key: "r_elbow", label: "오른팔꿈치", side: "right", kind: "joint", a: J.right_shoulder, b: J.right_elbow, c: J.right_wrist },
  { key: "l_shoulder", label: "왼어깨 (겨드랑이)", side: "left", kind: "joint", a: J.left_hip, b: J.left_shoulder, c: J.left_elbow },
  { key: "r_shoulder", label: "오른어깨 (겨드랑이)", side: "right", kind: "joint", a: J.right_hip, b: J.right_shoulder, c: J.right_elbow },
  { key: "l_wrist", label: "왼손목", side: "left", kind: "joint", a: J.left_elbow, b: J.left_wrist, c: J.left_index },
  { key: "r_wrist", label: "오른손목", side: "right", kind: "joint", a: J.right_elbow, b: J.right_wrist, c: J.right_index },
  { key: "l_forearm_elev", label: "왼팔뚝 기울기", side: "left", kind: "elev", from: J.left_elbow, to: J.left_wrist, joint: J.left_wrist },
  { key: "r_forearm_elev", label: "오른팔뚝 기울기", side: "right", kind: "elev", from: J.right_elbow, to: J.right_wrist, joint: J.right_wrist },
  { key: "l_forearm_yaw", label: "왼팔뚝 중심선 각", side: "left", kind: "yaw", from: J.left_elbow, to: J.left_wrist, joint: J.left_wrist },
  { key: "r_forearm_yaw", label: "오른팔뚝 중심선 각", side: "right", kind: "yaw", from: J.right_elbow, to: J.right_wrist, joint: J.right_wrist },
  { key: "l_elbow_offset", label: "왼팔꿈치 중심선 거리", side: "left", kind: "offset", joint: J.left_elbow },
  { key: "r_elbow_offset", label: "오른팔꿈치 중심선 거리", side: "right", kind: "offset", joint: J.right_elbow },
  { key: "l_knee", label: "왼무릎", side: "left", kind: "joint", a: J.left_hip, b: J.left_knee, c: J.left_ankle },
  { key: "r_knee", label: "오른무릎", side: "right", kind: "joint", a: J.right_hip, b: J.right_knee, c: J.right_ankle },
  { key: "l_hip", label: "왼고관절", side: "left", kind: "joint", a: J.left_shoulder, b: J.left_hip, c: J.left_knee },
  { key: "r_hip", label: "오른고관절", side: "right", kind: "joint", a: J.right_shoulder, b: J.right_hip, c: J.right_knee },
  { key: "stance", label: "발 벌림 (발목 간격)", side: "center", kind: "width", a: J.left_ankle, b: J.right_ankle },
  { key: "l_foot_yaw", label: "왼발 방향", side: "left", kind: "yaw", from: J.left_heel, to: J.left_foot_index, joint: J.left_foot_index },
  { key: "r_foot_yaw", label: "오른발 방향", side: "right", kind: "yaw", from: J.right_heel, to: J.right_foot_index, joint: J.right_foot_index },
];

/** 한 프레임의 전체 각도 목록 */
export function jointAngles(lm, frame = bodyFrame(lm)) {
  const out = [];
  for (const d of ANGLE_DEFS) {
    let value, unit = "°", joint = d.b ?? d.joint;
    if (d.kind === "joint") {
      value = angleAt(lm[d.a], lm[d.b], lm[d.c]);
    } else if (d.kind === "elev") {
      value = elevation(sub(lm[d.to], lm[d.from]), frame);
    } else if (d.kind === "yaw") {
      value = yaw(sub(lm[d.to], lm[d.from]), frame);
    } else if (d.kind === "offset") {
      value = toBody(lm[d.joint], frame)[0] * 100;
      unit = "cm";
    } else if (d.kind === "width") {
      value = dist(lm[d.a], lm[d.b]) * 100;
      unit = "cm";
      joint = d.a;
    }
    out.push({ key: d.key, label: d.label, side: d.side, kind: d.kind, value, unit, joint, def: d });
  }
  return out;
}

/** 각도 목록 → key로 찾기 */
export function anglesByKey(list) {
  return Object.fromEntries(list.map((a) => [a.key, a]));
}

/**
 * 두 자세의 각도 차이. 뷰어가 "책 자세 대비 몇 도 벗어났는지" 보여줄 때 쓴다.
 * yaw는 ±180 경계를 넘을 수 있어 최단 차이를 취한다.
 */
export function compareAngles(cur, ref) {
  const r = anglesByKey(ref);
  return cur.map((a) => {
    const b = r[a.key];
    if (!b || a.value == null || b.value == null) return { ...a, ref: b?.value ?? null, delta: null };
    let delta = a.value - b.value;
    if (a.kind === "yaw") delta = ((delta + 540) % 360) - 180;
    return { ...a, ref: b.value, delta };
  });
}

/** 일치도 계산에 쓰는 각도 (몸통·팔·다리의 큰 각. 손목·발 방향처럼 흔들리는 값은 뺀다) */
export const SCORE_KEYS = ["l_elbow", "r_elbow", "l_shoulder", "r_shoulder", "l_forearm_elev", "r_forearm_elev", "l_knee", "r_knee", "l_hip", "r_hip"];

/**
 * 내 자세가 목표 자세와 얼마나 맞는지 0~100.
 * 평균 각도 차이 0° = 100, fullOff(기본 40°) 이상 = 0. 함께 가장 크게 벗어난 항목도 돌려준다.
 */
export function matchScore(userLm, targetLm, { keys = SCORE_KEYS, fullOff = 40 } = {}) {
  const diffs = compareAngles(jointAngles(userLm), jointAngles(targetLm)).filter((a) => keys.includes(a.key) && a.delta !== null);
  if (!diffs.length) return { score: 0, mean: null, worst: [] };
  const mean = diffs.reduce((s, a) => s + Math.abs(a.delta), 0) / diffs.length;
  const score = Math.round(Math.max(0, Math.min(100, 100 * (1 - mean / fullOff))));
  const worst = [...diffs].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 3);
  return { score, mean, worst };
}

function fmt(v, unit) {
  return `${Math.round(v)}${unit}`;
}

const VERB = {
  joint: (d) => (d > 0 ? "펴기" : "굽히기"),
  elev: (d) => (d > 0 ? "올리기" : "내리기"),
  yaw: (d) => (d > 0 ? "왼쪽으로" : "오른쪽으로"),
  offset: (d) => (d > 0 ? "왼쪽으로" : "오른쪽으로"),
  width: (d) => (d > 0 ? "벌리기" : "모으기"),
};

/**
 * 전 자세 → 다음 자세로 갈 때 무엇이 얼마나 움직이는지 한국어 문장으로.
 * threshold 이하의 변화는 "거의 그대로"로 취급해 뺀다.
 */
export function describeTransition(fromLm, toLm, { threshold = 8, limit = 6 } = {}) {
  const diffs = compareAngles(jointAngles(toLm), jointAngles(fromLm))
    .filter((a) => a.delta !== null && Math.abs(a.delta) >= threshold)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, limit);
  return diffs.map((a) => ({
    key: a.key,
    label: a.label,
    from: a.ref,
    to: a.value,
    delta: a.delta,
    unit: a.unit,
    verb: VERB[a.kind](a.delta),
    text: `${a.label} ${fmt(a.ref, a.unit)} → ${fmt(a.value, a.unit)} (${fmt(Math.abs(a.delta), a.unit)} ${VERB[a.kind](a.delta)})`,
  }));
}
