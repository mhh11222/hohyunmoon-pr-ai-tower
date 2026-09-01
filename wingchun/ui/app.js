// 영춘권 자세 가이드 — 화면 제어. 데이터(data/sequence.js)와 순수 계산(src/)을 3D(figure3d)와 DOM에 잇는다.
import { sequence } from "../data/sequence.js";
import { frameAt, duration, poseIndexAt, transitionOf, alignToPose, validateSequence, autoPoses } from "../src/sequence.js";
import { jointAngles, compareAngles, describeTransition, matchScore, ANGLE_DEFS } from "../src/angles.js";
import { createFigure } from "./figure3d.js";
import { startCamera } from "./camera.js";

const $ = (id) => document.getElementById(id);
const fmt = (v, unit) => (v == null || !Number.isFinite(v) ? "–" : `${Math.round(v)}${unit}`);
const fmtDelta = (v, unit) => (v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v)}${unit}`);
const deltaClass = (v, unit) => {
  if (v == null) return "";
  const abs = Math.abs(v), tol = unit === "cm" ? [4, 8] : [10, 20];
  return abs <= tol[0] ? "d-ok" : abs <= tol[1] ? "d-warn" : "d-bad";
};
/** 값이 바뀔 때만 DOM에 쓴다 (매 프레임 DOM 변경 방지) */
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const setClass = (el, cls) => { if (el.className !== cls) el.className = cls; };

export async function boot() {
  const seq = sequence;
  const problems = validateSequence(seq);
  if (problems.length) console.warn("sequence 데이터 문제:", problems);
  if (!seq.poses?.length) seq.poses = autoPoses(seq);
  // 영상 구간이 있는 자세만 시간축에 올린다 (구간 없는 자세는 목록에만 흐리게)
  const timed = seq.poses.map((p, i) => ({ ...p, index: i })).filter((p) => p.start != null);
  const timedSeq = { ...seq, poses: timed };
  const total = duration(seq);
  const fps = seq.fps || 15;
  const frameDt = 1 / fps;
  const coarse = matchMedia("(pointer: coarse)").matches;

  $("title").textContent = seq.title || "영춘권 자세 가이드";
  if (seq.title) document.title = `${seq.title} · 영춘권 자세 가이드`;
  $("meta").textContent = [seq.subtitle, `${seq.frames.length}프레임 · ${total.toFixed(1)}초`].filter(Boolean).join(" · ");
  if (coarse) $("stage-hint").textContent = "한 손가락 회전 · 두 손가락 확대/이동";

  const figure = await createFigure($("figure"), { coarse });
  if (!figure) { $("nogl").hidden = false; }

  // ---------- 상태 ----------
  const st = {
    mode: "play",          // play | pose | transition
    t: 0,
    playing: false,
    speed: 1,
    poseIdx: 0,            // timed 배열 인덱스
    ghost: true,
    showRef: false,
    selectedAngle: null,   // ANGLE_DEFS key
    range: [0, total],
    userLm: null,          // 카메라로 인식한 내 자세
    cam: null,             // 카메라 핸들
    dirty: true,           // 3D를 다시 그려야 하는가
  };
  const markDirty = () => { st.dirty = true; };

  const poseAt = (i) => timed[Math.max(0, Math.min(timed.length - 1, i))];
  const hasPoses = timed.length > 0;

  /** 전환 모드에서 보여줄 전환: 보통 [이 자세 → 다음 자세], 마지막 자세면 [이전 자세 → 이 자세] */
  function currentTransition() {
    if (timed.length < 2) return null;
    const i = st.poseIdx < timed.length - 1 ? st.poseIdx : st.poseIdx - 1;
    return transitionOf(timedSeq, i);
  }

  function computeRange() {
    if (st.mode === "play" || !hasPoses) return [0, total];
    if (st.mode === "pose") { const p = poseAt(st.poseIdx); return [p.start, p.end]; }
    const tr = currentTransition();
    return tr ? [tr.start, tr.end] : [0, total];
  }

  function applyRange() {
    st.range = computeRange();
    $("scrub").min = st.range[0]; $("scrub").max = st.range[1];
  }

  function setMode(mode) {
    if (mode !== "play" && !hasPoses) return;
    st.mode = mode;
    document.querySelectorAll("#modes button").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    });
    applyRange();
    if (mode === "pose") { st.playing = false; st.t = poseAt(st.poseIdx).key; }
    else if (mode === "transition") { st.t = st.range[0]; st.playing = true; }
    else { st.playing = true; }
    $("ghost").disabled = mode === "pose";
    syncPlayButton();
    renderPoseCards();
    markDirty();
  }

  function setPose(i) {
    if (!hasPoses) return;
    st.poseIdx = Math.max(0, Math.min(timed.length - 1, i));
    applyRange();
    st.t = st.mode === "transition" ? st.range[0] : poseAt(st.poseIdx).key;
    renderPoseCards();
    markDirty();
  }

  function wrap(t) {
    const [a, b] = st.range;
    if (b <= a) return a;
    if (t > b) return st.mode === "play" ? a + ((t - a) % (b - a)) : a; // 자세/전환 모드는 처음으로 되감기
    if (t < a) return a;
    return t;
  }
  const clamp = (t) => Math.min(st.range[1], Math.max(st.range[0], t));

  function syncPlayButton() {
    const b = $("playpause");
    const label = st.mode === "pose" ? "전환 재생" : st.playing ? "멈춤" : "재생";
    setText(b, st.playing ? "❚❚" : "▶");
    b.title = label; b.setAttribute("aria-label", label);
    $("prev").disabled = !hasPoses || st.poseIdx <= 0;
    $("next").disabled = !hasPoses || st.poseIdx >= timed.length - 1;
  }

  // ---------- 자세 카드 / 전환 카드 ----------
  const refAngleCache = new Map();
  function refAnglesOf(p) {
    if (!p?.ref) return null;
    if (!refAngleCache.has(p.index)) refAngleCache.set(p.index, jointAngles(p.ref));
    return refAngleCache.get(p.index);
  }
  const ghostCache = new Map();
  function ghostOf(i) {
    if (!ghostCache.has(i)) ghostCache.set(i, frameAt(seq, poseAt(i).key));
    return ghostCache.get(i);
  }

  let chipEls = [];
  function renderPoseCards() {
    const p = poseAt(st.poseIdx);
    if (!p) return;
    setText($("pose-name"), p.name);
    setText($("pose-zh"), p.zh || "");
    setText($("pose-idx"), `${p.index + 1} / ${seq.poses.length}`);
    setText($("card-name"), p.name);
    setText($("card-zh"), p.zh || "");
    setText($("card-desc"), p.desc || "");
    const cues = $("card-cues"); cues.replaceChildren();
    for (const c of p.cues || []) { const li = document.createElement("li"); li.textContent = c; cues.append(li); }
    const img = $("book-img");
    if (p.image) {
      if (img.getAttribute("src") !== p.image) img.src = p.image;
      img.alt = `${p.name} 책 사진`; img.hidden = false; setText($("book-cap"), `책 사진 ${p.index + 1}`);
    } else { img.hidden = true; img.removeAttribute("src"); setText($("book-cap"), "책 사진 없음 — book/ 폴더에 넣고 poses.json에 경로를 적으면 여기 보입니다"); }

    // 전환 카드: 다음 자세로 가는 길. 마지막 자세는 이전 자세에서 오는 길.
    const tr = currentTransition();
    const card = $("transition-card");
    if (!tr) { card.hidden = true; }
    else {
      card.hidden = false;
      const isLast = st.poseIdx === timed.length - 1;
      setText($("trans-head"), isLast ? "이전 자세에서 오기" : "다음 자세로 넘어가기");
      setText($("trans-title"), `${tr.from.name} → ${tr.to.name} (${(tr.end - tr.start).toFixed(1)}초)`);
      setText($("trans-hint"), tr.to.transition || "");
      const list = $("trans-list"); list.replaceChildren();
      const steps = describeTransition(frameAt(seq, tr.start), frameAt(seq, tr.end));
      if (!steps.length) { const li = document.createElement("li"); li.textContent = "큰 각도 변화 없음 (8° 미만)"; list.append(li); }
      for (const s of steps) {
        const li = document.createElement("li");
        li.textContent = s.text;
        const def = ANGLE_DEFS.find((d) => d.key === s.key);
        li.className = def?.side || "";
        li.tabIndex = 0; li.setAttribute("role", "button");
        li.addEventListener("click", () => selectAngle(s.key));
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectAngle(s.key); } });
        list.append(li);
      }
    }
    chipEls.forEach((b, i) => {
      const on = i === p.index;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    });
    // 칩 줄만 가로로 스크롤한다 (페이지 세로 스크롤은 건드리지 않음)
    const chip = chipEls[p.index], strip = $("poses");
    if (chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
    $("showref").disabled = !p.ref;
    $("showref").title = p.ref ? "" : "이 자세는 책 사진 인식 결과(ref)가 없습니다";
    syncPlayButton();
    renderMarkerState();
  }

  function renderPoseChips() {
    const box = $("poses"); box.replaceChildren();
    chipEls = seq.poses.map((p, i) => {
      const b = document.createElement("button");
      b.dataset.index = i;
      const n = document.createElement("small"); n.textContent = String(i + 1);
      b.append(n, p.name);
      b.setAttribute("aria-pressed", "false");
      if (p.start == null) { b.classList.add("nodata"); b.title = "영상 구간이 지정되지 않은 자세"; b.disabled = true; }
      b.addEventListener("click", () => {
        const ti = timed.findIndex((q) => q.index === i);
        if (ti < 0) return;
        if (st.mode === "play") setMode("pose");
        setPose(ti);
      });
      box.append(b);
      return b;
    });
  }

  // 타임라인 표식: 구간이 바뀔 때만 다시 만들고, 현재 자세 표시는 클래스만 바꾼다
  let markerTicks = [], markerRange = null;
  function renderMarkers() {
    const [a, b] = st.range;
    if (markerRange && markerRange[0] === a && markerRange[1] === b) return;
    markerRange = [a, b];
    const box = $("markers"); box.replaceChildren();
    const span = b - a || 1;
    const pct = (t) => `${((t - a) / span) * 100}%`;
    markerTicks = [];
    timed.forEach((p, i) => {
      if (p.end < a || p.start > b) { markerTicks[i] = null; return; }
      const hold = document.createElement("i");
      hold.className = "hold";
      hold.style.left = pct(Math.max(a, p.start));
      hold.style.width = `${((Math.min(b, p.end) - Math.max(a, p.start)) / span) * 100}%`;
      box.append(hold);
      const tick = document.createElement("i");
      tick.style.left = pct(p.key);
      tick.title = p.name;
      box.append(tick);
      markerTicks[i] = tick;
    });
  }
  function renderMarkerState() {
    renderMarkers();
    markerTicks.forEach((t, i) => t && t.classList.toggle("on", i === st.poseIdx));
  }

  // ---------- 각도 표 ----------
  const angleRows = new Map();
  function buildAngleTable() {
    const tbody = $("angle-rows"); tbody.replaceChildren();
    for (const d of ANGLE_DEFS) {
      const tr = document.createElement("tr");
      tr.className = d.side;
      tr.dataset.key = d.key;
      tr.tabIndex = 0; tr.setAttribute("role", "button"); tr.setAttribute("aria-pressed", "false");
      const cells = {};
      const name = document.createElement("td"); name.textContent = d.label; tr.append(name);
      for (const k of ["cur", "ref", "delta", "me-cur", "me-delta"]) {
        const td = document.createElement("td"); td.textContent = "–";
        td.className = k.startsWith("me") ? `me ${k}` : k;
        tr.append(td); cells[k] = td;
      }
      const toggle = () => selectAngle(st.selectedAngle === d.key ? null : d.key);
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      tbody.append(tr);
      angleRows.set(d.key, { tr, cells });
    }
  }

  function selectAngle(key) {
    st.selectedAngle = key;
    angleRows.forEach(({ tr }, k) => { tr.classList.toggle("on", k === key); tr.setAttribute("aria-pressed", String(k === key)); });
    const def = ANGLE_DEFS.find((d) => d.key === key);
    figure?.setHighlight(!def ? null : def.kind === "joint" ? { a: def.a, b: def.b, c: def.c } : { joint: def.b ?? def.joint });
    markDirty();
  }

  let lastAngles = null;
  function updateAngleTable(lm) {
    const cur = jointAngles(lm);
    const ref = refAnglesOf(poseAt(st.poseIdx));
    const rows = ref ? compareAngles(cur, ref) : cur.map((a) => ({ ...a, ref: null, delta: null }));
    lastAngles = rows;
    const me = st.userLm ? Object.fromEntries(compareAngles(jointAngles(st.userLm), cur).map((a) => [a.key, a])) : null;
    for (const a of rows) {
      const { cells } = angleRows.get(a.key);
      setText(cells.cur, fmt(a.value, a.unit));
      setText(cells.ref, fmt(a.ref, a.unit));
      setText(cells.delta, fmtDelta(a.delta, a.unit));
      setClass(cells.delta, `delta ${deltaClass(a.delta, a.unit)}`);
      if (me) {
        const m = me[a.key];
        setText(cells["me-cur"], fmt(m.value, m.unit));
        setText(cells["me-delta"], fmtDelta(m.delta, m.unit));
        setClass(cells["me-delta"], `me me-delta ${deltaClass(m.delta, m.unit)}`);
      }
    }
  }

  // ---------- 카메라 대조 ----------
  const camBtn = $("cam-toggle"), camStatus = $("cam-status"), camTips = $("cam-tips");
  function cameraOff(message) {
    st.cam?.stop(); st.cam = null; st.userLm = null;
    figure?.setUser(null);
    document.body.classList.remove("cam-on"); camBtn.classList.remove("on"); camBtn.setAttribute("aria-pressed", "false");
    $("cam-pip").hidden = true; $("cam-score").hidden = true; camTips.hidden = true;
    camStatus.textContent = message;
    markDirty();
  }
  async function toggleCamera() {
    if (st.cam) { cameraOff("카메라를 껐습니다."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { camStatus.textContent = "이 브라우저는 카메라를 지원하지 않습니다. HTTPS 주소에서 열어야 합니다."; return; }
    camBtn.disabled = true;
    try {
      st.cam = await startCamera({
        video: $("cam-video"), overlay: $("cam-overlay"),
        onPose: (lm) => { st.userLm = lm; markDirty(); },
        onStatus: (m) => { camStatus.textContent = m; },
        onEnded: () => cameraOff("카메라 연결이 끊겼습니다. 다시 켜 주세요."),
      });
      document.body.classList.add("cam-on"); camBtn.classList.add("on"); camBtn.setAttribute("aria-pressed", "true");
      $("cam-pip").hidden = false; $("cam-score").hidden = false; camTips.hidden = false;
      camStatus.textContent = "분홍 인체가 내 자세입니다. 화면의 자세(자세 고정 모드 추천)와 겹쳐 보세요.";
    } catch (e) {
      console.error(e);
      const why = e?.name === "NotAllowedError" ? "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요."
        : e?.name === "NotFoundError" ? "카메라를 찾지 못했습니다."
        : `인식 모델을 불러오지 못했습니다 (${e?.message || e}). 인터넷 연결을 확인하고 다시 눌러 주세요.`;
      camStatus.textContent = why;
      st.cam = null;
    }
    camBtn.disabled = false;
  }
  camBtn.addEventListener("click", toggleCamera);
  document.addEventListener("visibilitychange", () => { if (document.hidden && st.cam) cameraOff("화면을 벗어나 카메라를 껐습니다."); });

  let scoreAcc = 0;
  function updateScore(lm, dt) {
    scoreAcc += dt;
    if (scoreAcc < 0.15) return;
    scoreAcc = 0;
    const box = $("cam-score");
    if (!st.userLm) {
      setText($("score-num"), "–");
      camTips.replaceChildren(Object.assign(document.createElement("li"), { textContent: "카메라에 전신이 보이지 않습니다" }));
      return;
    }
    const { score } = matchScore(st.userLm, lm);
    setText($("score-num"), `${score}%`);
    box.style.borderColor = score >= 80 ? "var(--ok)" : score >= 55 ? "var(--warn)" : "var(--bad)";
    const steps = describeTransition(st.userLm, lm, { threshold: 12, limit: 3 });
    const items = steps.length
      ? steps.map((s) => Object.assign(document.createElement("li"), { textContent: `${s.label}: 지금 ${fmt(s.from, s.unit)} → ${fmt(s.to, s.unit)}로 ${fmt(Math.abs(s.delta), s.unit)} ${s.verb}` }))
      : [Object.assign(document.createElement("li"), { className: "ok", textContent: "화면 자세와 거의 같습니다" })];
    camTips.replaceChildren(...items);
  }

  function updateLabels(lm) {
    const box = $("labels");
    const a = figure && st.selectedAngle && lastAngles ? lastAngles.find((x) => x.key === st.selectedAngle) : null;
    const p = a ? figure.project(lm[a.joint]) : null;
    if (!p) { if (box.firstElementChild) box.replaceChildren(); return; }
    let el = box.firstElementChild;
    if (!el) { el = document.createElement("div"); el.className = "lbl"; box.append(el); }
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    setText(el, `${a.label} ${fmt(a.value, a.unit)}${a.ref != null ? ` (책 ${fmt(a.ref, a.unit)})` : ""}`);
  }

  // ---------- 조작 ----------
  document.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => { figure?.setView(b.dataset.view); syncAzimuth(); markDirty(); }));
  $("playpause").addEventListener("click", () => { if (st.mode === "pose") setMode("transition"); else { st.playing = !st.playing; syncPlayButton(); } });
  $("prev").addEventListener("click", () => { if (st.mode === "play") setMode("pose"); setPose(st.poseIdx - 1); });
  $("next").addEventListener("click", () => { if (st.mode === "play") setMode("pose"); setPose(st.poseIdx + 1); });
  const step = (n) => { st.playing = false; syncPlayButton(); st.t = clamp(st.t + n * frameDt); markDirty(); };
  $("step-back").addEventListener("click", () => step(-1));
  $("step-fwd").addEventListener("click", () => step(1));
  $("speed").addEventListener("change", (e) => { st.speed = Number(e.target.value); });
  $("ghost").addEventListener("change", (e) => { st.ghost = e.target.checked; markDirty(); });
  $("showref").addEventListener("change", (e) => { st.showRef = e.target.checked; markDirty(); });
  $("scrub").addEventListener("input", (e) => { st.playing = false; syncPlayButton(); st.t = Number(e.target.value); markDirty(); });

  // 조그 휠: 좌우로 끌면 프레임 단위로 이동
  const jog = $("jog-strip");
  let jogX = null, jogAcc = 0;
  jog.addEventListener("pointerdown", (e) => { jog.setPointerCapture(e.pointerId); jogX = e.clientX; jogAcc = 0; jog.classList.add("active"); st.playing = false; syncPlayButton(); });
  jog.addEventListener("pointermove", (e) => {
    if (jogX == null) return;
    jogAcc += e.clientX - jogX; jogX = e.clientX;
    const PX = 10;
    while (Math.abs(jogAcc) >= PX) { step(Math.sign(jogAcc)); jogAcc -= Math.sign(jogAcc) * PX; }
  });
  const jogEnd = () => { jogX = null; jog.classList.remove("active"); };
  jog.addEventListener("pointerup", jogEnd); jog.addEventListener("pointercancel", jogEnd);
  jog.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } });

  // 회전 슬라이더 ↔ 3D
  function syncAzimuth() { if (!figure) return; const d = Math.round(figure.orbit.azimuthDeg()); $("azimuth").value = d; setText($("azimuth-out"), `${d}°`); }
  $("azimuth").addEventListener("input", (e) => { figure?.orbit.setAzimuthDeg(Number(e.target.value)); setText($("azimuth-out"), `${e.target.value}°`); });
  if (figure) figure.orbit.onChange = () => { syncAzimuth(); markDirty(); };

  window.addEventListener("keydown", (e) => {
    if (e.target.closest("button, input, select, textarea, a, [tabindex]")) return;
    if (e.code === "Space") { e.preventDefault(); $("playpause").click(); }
    else if (e.code === "ArrowRight") step(1);
    else if (e.code === "ArrowLeft") step(-1);
    else if (e.code === "BracketRight") $("next").click();
    else if (e.code === "BracketLeft") $("prev").click();
  });

  // ---------- 루프 ----------
  buildAngleTable();
  renderPoseChips();
  setMode("play");
  st.playing = true; syncPlayButton();
  syncAzimuth();
  if (figure) figure.onResize = markDirty;

  let last = performance.now(), acc = 0, lastT = -1;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (st.playing) st.t = wrap(st.t + dt * st.speed);
    if (st.t !== lastT) { lastT = st.t; st.dirty = true; }
    // 연속 재생 중에는 현재 자세를 시간으로 따라간다
    if (st.mode === "play" && hasPoses) {
      const i = poseIndexAt(timedSeq, st.t);
      if (i >= 0 && i !== st.poseIdx) { st.poseIdx = i; renderPoseCards(); }
    }
    if (st.dirty) {
      st.dirty = false;
      const lm = frameAt(seq, st.t);
      if (figure) {
        figure.setPose(lm);
        const p = poseAt(st.poseIdx);
        let ghostLm = null;
        if (st.ghost && st.mode === "transition") ghostLm = frameAt(seq, st.range[0]);
        else if (st.ghost && st.mode === "play" && st.poseIdx > 0) ghostLm = ghostOf(st.poseIdx - 1);
        figure.setGhost(ghostLm);
        figure.setRef(st.showRef && p?.ref ? alignToPose(p.ref, lm) : null);
        figure.setUser(st.userLm ? alignToPose(st.userLm, lm) : null);
        figure.render();
      }
      if (st.cam) updateScore(lm, Math.max(dt, 0.16));
      $("scrub").value = st.t;
      setText($("clock"), `${st.t.toFixed(2)}s`);
      acc += dt;
      if (acc > 0.08 || !st.playing) { acc = 0; updateAngleTable(lm); }
      updateLabels(lm);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
