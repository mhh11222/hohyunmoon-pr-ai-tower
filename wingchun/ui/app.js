// 영춘권 자세 가이드 — 화면 제어. 데이터(data/sequence.js)와 순수 계산(src/)을 3D(figure3d)와 DOM에 잇는다.
import { sequence } from "../data/sequence.js";
import { frameAt, duration, poseIndexAt, transitionOf, alignToPose, validateSequence, autoPoses } from "../src/sequence.js";
import { jointAngles, compareAngles, describeTransition, ANGLE_DEFS } from "../src/angles.js";
import { createFigure } from "./figure3d.js";

const $ = (id) => document.getElementById(id);

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

  $("title").textContent = seq.title || "영춘권 자세 가이드";
  $("meta").textContent = [seq.subtitle, seq.source ? `원본: ${seq.source}` : "", `${seq.frames.length}프레임 · ${total.toFixed(1)}초`].filter(Boolean).join(" · ");

  const figure = await createFigure($("figure"));
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
  };

  const poseAt = (i) => timed[Math.max(0, Math.min(timed.length - 1, i))];

  function computeRange() {
    if (st.mode === "play" || !timed.length) return [0, total];
    if (st.mode === "pose") { const p = poseAt(st.poseIdx); return [p.start, p.end]; }
    // transition: 이 자세의 대표 시각 → 다음 자세의 대표 시각
    const i = Math.min(st.poseIdx, timed.length - 2);
    const tr = transitionOf(timedSeq, Math.max(0, i));
    return tr ? [tr.start, tr.end] : [0, total];
  }

  function setMode(mode) {
    st.mode = mode;
    document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    st.range = computeRange();
    if (mode === "pose") { st.playing = false; st.t = poseAt(st.poseIdx).key; }
    else if (mode === "transition") { st.t = st.range[0]; st.playing = true; }
    else { st.playing = true; }
    $("scrub").min = st.range[0]; $("scrub").max = st.range[1];
    $("ghost").disabled = mode === "pose";
    syncPlayButton();
    renderPoseCards();
    renderMarkers();
  }

  function setPose(i, { jump = true } = {}) {
    if (!timed.length) return;
    st.poseIdx = Math.max(0, Math.min(timed.length - 1, i));
    st.range = computeRange();
    $("scrub").min = st.range[0]; $("scrub").max = st.range[1];
    if (jump) st.t = st.mode === "transition" ? st.range[0] : poseAt(st.poseIdx).key;
    renderPoseCards();
    renderMarkers();
  }

  function wrap(t) {
    const [a, b] = st.range;
    if (b <= a) return a;
    if (t > b) return st.mode === "play" ? a + ((t - a) % (b - a)) : a; // 자세/전환 모드는 처음으로 되감기
    if (t < a) return a;
    return t;
  }

  function syncPlayButton() { $("playpause").textContent = st.playing ? "❚❚" : "▶"; }

  // ---------- 자세 카드 / 전환 카드 ----------
  const refAngleCache = new Map();
  function refAnglesOf(p) {
    if (!p?.ref) return null;
    if (!refAngleCache.has(p.id)) refAngleCache.set(p.id, jointAngles(p.ref));
    return refAngleCache.get(p.id);
  }

  function renderPoseCards() {
    const p = poseAt(st.poseIdx);
    if (!p) return;
    $("pose-name").textContent = p.name;
    $("pose-zh").textContent = p.zh || "";
    $("pose-idx").textContent = `${p.index + 1} / ${seq.poses.length}`;
    $("card-name").textContent = p.name;
    $("card-zh").textContent = p.zh || "";
    $("card-desc").textContent = p.desc || "";
    const cues = $("card-cues"); cues.innerHTML = "";
    for (const c of p.cues || []) { const li = document.createElement("li"); li.textContent = c; cues.append(li); }
    const img = $("book-img");
    if (p.image) { img.src = p.image; img.alt = `${p.name} 책 사진`; img.hidden = false; $("book-cap").textContent = `책 사진 · ${p.image}`; }
    else { img.hidden = true; img.removeAttribute("src"); $("book-cap").textContent = "책 사진 없음 — book/ 폴더에 넣고 poses.json에 경로를 적으면 여기 보입니다"; }

    // 전환 카드
    const tr = transitionOf(timedSeq, Math.min(st.poseIdx, timed.length - 2));
    const card = $("transition-card");
    if (!tr || timed.length < 2) { card.hidden = true; }
    else {
      card.hidden = false;
      $("trans-title").textContent = `${tr.from.name} → ${tr.to.name}`;
      $("trans-hint").textContent = tr.to.transition || tr.from.transitionOut || "";
      const list = $("trans-list"); list.innerHTML = "";
      const steps = describeTransition(frameAt(seq, tr.start), frameAt(seq, tr.end));
      if (!steps.length) { const li = document.createElement("li"); li.textContent = "큰 각도 변화 없음 (8° 미만)"; list.append(li); }
      for (const s of steps) {
        const li = document.createElement("li");
        li.textContent = s.text;
        const def = ANGLE_DEFS.find((d) => d.key === s.key);
        li.className = def?.side || "";
        li.dataset.key = s.key;
        li.style.cursor = "pointer";
        li.addEventListener("click", () => selectAngle(s.key));
        list.append(li);
      }
      const secs = (tr.end - tr.start).toFixed(1);
      $("trans-title").textContent += ` (${secs}초)`;
    }
    document.querySelectorAll("#poses button").forEach((b) => b.classList.toggle("on", Number(b.dataset.index) === p.index));
    document.querySelector("#poses button.on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    $("showref").disabled = !p.ref;
    if (!p.ref) $("showref").title = "이 자세는 책 사진 인식 결과(ref)가 없습니다"; else $("showref").title = "";
  }

  function renderPoseChips() {
    const box = $("poses"); box.innerHTML = "";
    seq.poses.forEach((p, i) => {
      const b = document.createElement("button");
      b.dataset.index = i;
      b.innerHTML = `<small>${i + 1}</small>${p.name}`;
      if (p.start == null) { b.classList.add("nodata"); b.title = "영상 구간이 지정되지 않은 자세"; }
      b.addEventListener("click", () => {
        const ti = timed.findIndex((q) => q.index === i);
        if (ti < 0) return;
        if (st.mode === "play") setMode("pose");
        setPose(ti);
      });
      box.append(b);
    });
  }

  function renderMarkers() {
    const box = $("markers"); box.innerHTML = "";
    const [a, b] = st.range;
    const span = b - a || 1;
    const pct = (t) => `${((t - a) / span) * 100}%`;
    timed.forEach((p, i) => {
      if (p.end < a || p.start > b) return;
      const hold = document.createElement("i");
      hold.className = "hold";
      hold.style.left = pct(Math.max(a, p.start));
      hold.style.width = `${((Math.min(b, p.end) - Math.max(a, p.start)) / span) * 100}%`;
      box.append(hold);
      const tick = document.createElement("i");
      tick.style.left = pct(p.key);
      if (i === st.poseIdx) tick.classList.add("on");
      tick.title = p.name;
      box.append(tick);
    });
  }

  // ---------- 각도 표 ----------
  const angleRows = new Map();
  function buildAngleTable() {
    const tbody = $("angle-rows"); tbody.innerHTML = "";
    for (const d of ANGLE_DEFS) {
      const tr = document.createElement("tr");
      tr.className = d.side;
      tr.dataset.key = d.key;
      tr.innerHTML = `<td>${d.label}</td><td class="cur">–</td><td class="ref">–</td><td class="delta">–</td>`;
      tr.addEventListener("click", () => selectAngle(st.selectedAngle === d.key ? null : d.key));
      tbody.append(tr);
      angleRows.set(d.key, tr);
    }
  }

  function selectAngle(key) {
    st.selectedAngle = key;
    angleRows.forEach((tr, k) => tr.classList.toggle("on", k === key));
    const def = ANGLE_DEFS.find((d) => d.key === key);
    if (!def) { figure?.setHighlight(null); return; }
    figure?.setHighlight(def.kind === "joint" ? { a: def.a, b: def.b, c: def.c } : { joint: def.b ?? def.joint });
  }

  let lastAngles = null;
  function updateAngleTable(lm) {
    const cur = jointAngles(lm);
    const ref = refAnglesOf(poseAt(st.poseIdx));
    const rows = ref ? compareAngles(cur, ref) : cur.map((a) => ({ ...a, ref: null, delta: null }));
    lastAngles = rows;
    for (const a of rows) {
      const tr = angleRows.get(a.key);
      tr.querySelector(".cur").textContent = `${Math.round(a.value)}${a.unit}`;
      tr.querySelector(".ref").textContent = a.ref == null ? "–" : `${Math.round(a.ref)}${a.unit}`;
      const d = tr.querySelector(".delta");
      if (a.delta == null) { d.textContent = "–"; d.className = "delta"; }
      else {
        const abs = Math.abs(a.delta);
        const tol = a.unit === "cm" ? [4, 8] : [10, 20];
        d.textContent = `${a.delta > 0 ? "+" : ""}${Math.round(a.delta)}${a.unit}`;
        d.className = `delta ${abs <= tol[0] ? "d-ok" : abs <= tol[1] ? "d-warn" : "d-bad"}`;
      }
    }
  }

  function updateLabels(lm) {
    const box = $("labels");
    if (!figure || !st.selectedAngle || !lastAngles) { box.innerHTML = ""; return; }
    const a = lastAngles.find((x) => x.key === st.selectedAngle);
    if (!a) { box.innerHTML = ""; return; }
    const p = figure.project(lm[a.joint]);
    if (!p) { box.innerHTML = ""; return; }
    let el = box.firstElementChild;
    if (!el) { el = document.createElement("div"); el.className = "lbl"; box.append(el); }
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.textContent = `${a.label} ${Math.round(a.value)}${a.unit}${a.ref != null ? ` (책 ${Math.round(a.ref)}${a.unit})` : ""}`;
  }

  // ---------- 조작 ----------
  document.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => { figure?.setView(b.dataset.view); syncAzimuth(); }));
  $("playpause").addEventListener("click", () => { if (st.mode === "pose") setMode("transition"); else { st.playing = !st.playing; syncPlayButton(); } });
  $("prev").addEventListener("click", () => { if (st.mode === "play") setMode("pose"); setPose(st.poseIdx - 1); });
  $("next").addEventListener("click", () => { if (st.mode === "play") setMode("pose"); setPose(st.poseIdx + 1); });
  const step = (n) => { st.playing = false; syncPlayButton(); if (st.mode === "pose") st.range = [poseAt(st.poseIdx).start, poseAt(st.poseIdx).end]; st.t = wrap(st.t + n * frameDt); };
  $("step-back").addEventListener("click", () => step(-1));
  $("step-fwd").addEventListener("click", () => step(1));
  $("speed").addEventListener("change", (e) => { st.speed = Number(e.target.value); });
  $("ghost").addEventListener("change", (e) => { st.ghost = e.target.checked; });
  $("showref").addEventListener("change", (e) => { st.showRef = e.target.checked; });
  $("scrub").addEventListener("input", (e) => { st.playing = false; syncPlayButton(); st.t = Number(e.target.value); });

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

  // 회전 슬라이더 ↔ 3D
  function syncAzimuth() { if (!figure) return; const d = Math.round(figure.orbit.azimuthDeg()); $("azimuth").value = d; $("azimuth-out").textContent = `${d}°`; }
  $("azimuth").addEventListener("input", (e) => { figure?.orbit.setAzimuthDeg(Number(e.target.value)); $("azimuth-out").textContent = `${e.target.value}°`; });
  if (figure) figure.orbit.onChange = syncAzimuth;

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
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

  let last = performance.now(), acc = 0;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (st.playing) st.t = wrap(st.t + dt * st.speed);
    // 연속 재생 중에는 현재 자세를 시간으로 따라간다
    if (st.mode === "play") {
      const i = poseIndexAt(timedSeq, st.t);
      if (i >= 0 && i !== st.poseIdx) { st.poseIdx = i; renderPoseCards(); renderMarkers(); }
    }
    const lm = frameAt(seq, st.t);
    if (figure) {
      figure.setPose(lm);
      const p = poseAt(st.poseIdx);
      let ghostLm = null;
      if (st.ghost && st.mode === "transition") ghostLm = frameAt(seq, st.range[0]);
      else if (st.ghost && st.mode === "play" && st.poseIdx > 0) ghostLm = frameAt(seq, poseAt(st.poseIdx - 1).key);
      figure.setGhost(ghostLm);
      figure.setRef(st.showRef && p?.ref ? alignToPose(p.ref, lm) : null);
      figure.render();
    }
    $("scrub").value = st.t;
    $("clock").textContent = `${st.t.toFixed(2)}s`;
    acc += dt;
    if (acc > 0.08) { acc = 0; updateAngleTable(lm); }
    updateLabels(lm);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
