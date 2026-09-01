// 영춘권 자세 가이드 — 화면 제어. 데이터(data/sequence.js)와 순수 계산(src/)을 3D(figure3d)와 DOM에 잇는다.
import { sequence } from "../data/sequence.js";
import { frameAt, duration, poseIndexAt, transitionOf, alignToPose, validateSequence, autoPoses } from "../src/sequence.js";
import { jointAngles, compareAngles, describeDiff, scoreFromDiff, anglesByKey, fmt, ANGLE_DEFS } from "../src/angles.js";
import { createFigure } from "./figure3d.js";
import { startCamera } from "./camera.js";

const $ = (id) => document.getElementById(id);
const fmtDelta = (v, unit) => (v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v)}${unit}`);
const deltaClass = (v, unit) => {
  if (v == null) return "";
  const abs = Math.abs(v), tol = unit === "cm" ? [4, 8] : [10, 20];
  return abs <= tol[0] ? "d-ok" : abs <= tol[1] ? "d-warn" : "d-bad";
};
/** 값이 바뀔 때만 DOM에 쓴다 (매 프레임 DOM 변경 방지) */
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const setClass = (el, cls) => { if (el.className !== cls) el.className = cls; };
/** 선택 상태: 시각(.on)과 접근성(aria-pressed)을 한 곳에서 */
const setOn = (el, on) => { el.classList.toggle("on", on); el.setAttribute("aria-pressed", String(on)); };
/** 버튼이 아닌 요소를 클릭·Enter·Space로 누를 수 있게 */
const onActivate = (el, fn) => {
  el.tabIndex = 0; el.setAttribute("role", "button");
  el.addEventListener("click", fn);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
};
const li = (text, cls = "") => Object.assign(document.createElement("li"), { textContent: text, className: cls });

export async function boot() {
  const seq = sequence;
  const problems = validateSequence(seq);
  if (problems.length) console.warn("sequence 데이터 문제:", problems);
  if (!seq.poses?.length) seq.poses = autoPoses(seq);
  // 영상 구간이 있는 자세만 시간축에 올린다 (구간 없는 자세는 목록에만 흐리게)
  const timed = seq.poses.map((p, i) => ({ ...p, index: i })).filter((p) => p.start != null);
  const timedSeq = { ...seq, poses: timed };
  const total = duration(seq);
  const frameDt = 1 / (seq.fps || 15);
  const coarse = matchMedia("(pointer: coarse)").matches;
  const hasPoses = timed.length > 0;

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
    userLm: null,          // 카메라로 인식한 내 자세 (프레임마다 새 배열)
    cam: null,             // 카메라 핸들
  };

  const poseAt = (i) => timed[Math.max(0, Math.min(timed.length - 1, i))];

  /** 전환 모드·전환 카드가 보여줄 전환. 마지막 자세는 "이전 자세에서 오기"(incoming) */
  function currentTransition() {
    if (timed.length < 2) return null;
    const incoming = st.poseIdx === timed.length - 1;
    const tr = transitionOf(timedSeq, incoming ? st.poseIdx - 1 : st.poseIdx);
    return tr && { ...tr, incoming };
  }

  function applyRange() {
    st.range = st.mode === "play" || !hasPoses ? [0, total]
      : st.mode === "pose" ? [poseAt(st.poseIdx).start, poseAt(st.poseIdx).end]
      : (currentTransition() ? [currentTransition().start, currentTransition().end] : [0, total]);
    $("scrub").min = st.range[0]; $("scrub").max = st.range[1];
  }

  function setMode(mode) {
    if (mode !== "play" && !hasPoses) return;
    st.mode = mode;
    document.querySelectorAll("#modes button").forEach((b) => setOn(b, b.dataset.mode === mode));
    applyRange();
    if (mode === "pose") { st.playing = false; st.t = poseAt(st.poseIdx).key; }
    else if (mode === "transition") { st.t = st.range[0]; st.playing = true; }
    else { st.playing = true; }
    $("ghost").disabled = mode === "pose";
    renderPoseCards();
  }

  function setPose(i) {
    if (!hasPoses) return;
    st.poseIdx = Math.max(0, Math.min(timed.length - 1, i));
    applyRange();
    st.t = st.mode === "transition" ? st.range[0] : poseAt(st.poseIdx).key;
    renderPoseCards();
  }

  /** 구간 밖으로 나간 시각을 되돌린다. loop면 처음으로 감기(연속 재생), 아니면 양끝에서 멈춤 */
  function wrap(t, loop = st.mode === "play") {
    const [a, b] = st.range;
    if (b <= a) return a;
    if (t > b) return loop ? a + ((t - a) % (b - a)) : b;
    return t < a ? a : t;
  }

  function syncPlayButton() {
    const b = $("playpause");
    const label = st.mode === "pose" ? "전환 재생" : st.playing ? "멈춤" : "재생";
    setText(b, st.playing ? "❚❚" : "▶");
    if (b.title !== label) { b.title = label; b.setAttribute("aria-label", label); }
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
    $("card-cues").replaceChildren(...(p.cues || []).map((c) => li(c)));
    const img = $("book-img");
    if (p.image) {
      if (img.getAttribute("src") !== p.image) img.src = p.image;
      img.alt = `${p.name} 책 사진`; img.hidden = false; setText($("book-cap"), `책 사진 ${p.index + 1}`);
    } else { img.hidden = true; img.removeAttribute("src"); setText($("book-cap"), "책 사진 없음 — book/ 폴더에 넣고 poses.json에 경로를 적으면 여기 보입니다"); }

    const tr = currentTransition();
    const card = $("transition-card");
    card.hidden = !tr;
    if (tr) {
      setText($("trans-head"), tr.incoming ? "이전 자세에서 오기" : "다음 자세로 넘어가기");
      setText($("trans-title"), `${tr.from.name} → ${tr.to.name} (${(tr.end - tr.start).toFixed(1)}초)`);
      setText($("trans-hint"), tr.to.transition || "");
      const steps = describeDiff(jointAngles(frameAt(seq, tr.start)), jointAngles(frameAt(seq, tr.end)));
      const items = steps.length ? steps.map((s) => {
        const el = li(s.text, ANGLE_DEFS.find((d) => d.key === s.key)?.side || "");
        onActivate(el, () => selectAngle(s.key));
        return el;
      }) : [li("큰 각도 변화 없음 (8° 미만)")];
      $("trans-list").replaceChildren(...items);
    }
    chipEls.forEach((b, i) => setOn(b, i === p.index));
    // 칩 줄만 가로로 스크롤한다 (페이지 세로 스크롤은 건드리지 않음)
    const chip = chipEls[p.index], strip = $("poses");
    if (chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
    $("showref").disabled = !p.ref;
    $("showref").title = p.ref ? "" : "이 자세는 책 사진 인식 결과(ref)가 없습니다";
    syncPlayButton();
    renderMarkers();
  }

  function renderPoseChips() {
    chipEls = seq.poses.map((p, i) => {
      const b = document.createElement("button");
      b.append(Object.assign(document.createElement("small"), { textContent: String(i + 1) }), p.name);
      b.setAttribute("aria-pressed", "false");
      if (p.start == null) { b.classList.add("nodata"); b.title = "영상 구간이 지정되지 않은 자세"; b.disabled = true; }
      b.addEventListener("click", () => {
        const ti = timed.findIndex((q) => q.index === i);
        if (ti < 0) return;
        if (st.mode === "play") setMode("pose");
        setPose(ti);
      });
      return b;
    });
    $("poses").replaceChildren(...chipEls);
  }

  // 타임라인 표식: 구간이 바뀔 때만 다시 만들고, 현재 자세 표시는 클래스만 바꾼다
  let markerTicks = [], markerRange = null;
  function renderMarkers() {
    const [a, b] = st.range;
    if (!markerRange || markerRange[0] !== a || markerRange[1] !== b) {
      markerRange = [a, b];
      const span = b - a || 1;
      const pct = (t) => `${((t - a) / span) * 100}%`;
      const nodes = [];
      markerTicks = timed.map((p) => {
        if (p.end < a || p.start > b) return null;
        const hold = document.createElement("i");
        hold.className = "hold";
        hold.style.left = pct(Math.max(a, p.start));
        hold.style.width = `${((Math.min(b, p.end) - Math.max(a, p.start)) / span) * 100}%`;
        const tick = document.createElement("i");
        tick.style.left = pct(p.key);
        tick.title = p.name;
        nodes.push(hold, tick);
        return tick;
      });
      $("markers").replaceChildren(...nodes);
    }
    markerTicks.forEach((t, i) => t?.classList.toggle("on", i === st.poseIdx));
  }

  // ---------- 각도 표 ----------
  const angleRows = new Map();
  function buildAngleTable() {
    const rows = ANGLE_DEFS.map((d) => {
      const tr = document.createElement("tr");
      tr.className = d.side;
      tr.setAttribute("aria-pressed", "false");
      const cells = {};
      tr.append(Object.assign(document.createElement("td"), { textContent: d.label }));
      for (const k of ["cur", "ref", "delta", "me-cur", "me-delta"]) {
        cells[k] = Object.assign(document.createElement("td"), { textContent: "–", className: k.startsWith("me") ? `me ${k}` : k });
        tr.append(cells[k]);
      }
      onActivate(tr, () => selectAngle(st.selectedAngle === d.key ? null : d.key));
      angleRows.set(d.key, { tr, cells });
      return tr;
    });
    $("angle-rows").replaceChildren(...rows);
  }

  function selectAngle(key) {
    st.selectedAngle = key;
    angleRows.forEach(({ tr }, k) => setOn(tr, k === key));
    const def = ANGLE_DEFS.find((d) => d.key === key);
    figure?.setHighlight(!def ? null : def.kind === "joint" ? { a: def.a, b: def.b, c: def.c } : { joint: def.b ?? def.joint });
  }

  let lastAngles = null;
  /** cur/me는 이미 계산된 각도 목록 — 한 틱에 한 번만 jointAngles를 돌린다 */
  function updateAngleTable(cur, me) {
    const rows = compareAngles(cur, refAnglesOf(poseAt(st.poseIdx)) || []);
    lastAngles = rows;
    const mine = me && anglesByKey(compareAngles(me, cur));
    for (const a of rows) {
      const { cells } = angleRows.get(a.key);
      setText(cells.cur, fmt(a.value, a.unit));
      setText(cells.ref, fmt(a.ref, a.unit));
      setText(cells.delta, fmtDelta(a.delta, a.unit));
      setClass(cells.delta, `delta ${deltaClass(a.delta, a.unit)}`);
      if (mine) {
        const m = mine[a.key];
        setText(cells["me-cur"], fmt(m.value, m.unit));
        setText(cells["me-delta"], fmtDelta(m.delta, m.unit));
        setClass(cells["me-delta"], `me me-delta ${deltaClass(m.delta, m.unit)}`);
      }
    }
  }

  // ---------- 카메라 대조 ----------
  const camBtn = $("cam-toggle"), camStatus = $("cam-status"), camTips = $("cam-tips");
  /** 켜짐/꺼짐 표시는 body.cam-on 하나로; 나머지는 CSS가 따라온다 */
  function setCameraUI(on, message) {
    document.body.classList.toggle("cam-on", on);
    setOn(camBtn, on);
    camStatus.textContent = message;
  }
  function cameraOff(message) {
    st.cam?.stop(); st.cam = null; st.userLm = null;
    setCameraUI(false, message);
  }
  async function toggleCamera() {
    if (st.cam) { cameraOff("카메라를 껐습니다."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { camStatus.textContent = "이 브라우저는 카메라를 지원하지 않습니다. HTTPS 주소에서 열어야 합니다."; return; }
    camBtn.disabled = true;
    try {
      st.cam = await startCamera({
        video: $("cam-video"), overlay: $("cam-overlay"),
        onPose: (lm) => { st.userLm = lm; },
        onStatus: (m) => { camStatus.textContent = m; },
        onEnded: () => cameraOff("카메라 연결이 끊겼습니다. 다시 켜 주세요."),
      });
      setCameraUI(true, "분홍 인체가 내 자세입니다. 화면의 자세(자세 고정 모드 추천)와 겹쳐 보세요.");
    } catch (e) {
      console.error(e);
      const why = e?.name === "NotAllowedError" ? "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요."
        : e?.name === "NotFoundError" ? "카메라를 찾지 못했습니다."
        : e?.phase === "model" ? `인식 프로그램을 불러오지 못했습니다 (${e?.message || e}). 인터넷 연결을 확인하고 다시 눌러 주세요.`
        : `카메라를 켜지 못했습니다 (${e?.message || e}).`;
      setCameraUI(false, why);
      st.cam = null;
    }
    camBtn.disabled = false;
  }
  camBtn.addEventListener("click", toggleCamera);
  document.addEventListener("visibilitychange", () => { if (document.hidden && st.cam) cameraOff("화면을 벗어나 카메라를 껐습니다."); });

  /** 일치도와 교정 문장 — 이미 계산된 각도 목록으로 */
  function updateScore(cur, me) {
    if (!me) {
      setText($("score-num"), "–");
      camTips.replaceChildren(li("카메라에 전신이 보이지 않습니다"));
      return;
    }
    const diff = compareAngles(me, cur);
    const { score } = scoreFromDiff(diff);
    setText($("score-num"), `${score}%`);
    $("cam-score").style.borderColor = score >= 80 ? "var(--ok)" : score >= 55 ? "var(--warn)" : "var(--bad)";
    const steps = describeDiff(me, cur, { threshold: 12, limit: 3 });
    camTips.replaceChildren(...(steps.length
      ? steps.map((s) => li(`${s.label}: 지금 ${fmt(s.from, s.unit)} → ${fmt(s.to, s.unit)}로 ${fmt(Math.abs(s.delta), s.unit)} ${s.verb}`))
      : [li("화면 자세와 거의 같습니다", "ok")]));
  }

  function updateLabels(lm) {
    const box = $("labels");
    const a = figure && st.selectedAngle && lastAngles ? lastAngles.find((x) => x.key === st.selectedAngle) : null;
    const p = a ? figure.project(lm[a.joint]) : null;
    if (!p) { box.replaceChildren(); return; }
    let el = box.firstElementChild;
    if (!el) { el = document.createElement("div"); el.className = "lbl"; box.append(el); }
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    setText(el, `${a.label} ${fmt(a.value, a.unit)}${a.ref != null ? ` (책 ${fmt(a.ref, a.unit)})` : ""}`);
  }

  // ---------- 조작 ----------
  document.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("#views button").forEach((b) => b.addEventListener("click", () => figure?.setView(b.dataset.view)));
  $("playpause").addEventListener("click", () => { if (st.mode === "pose") setMode("transition"); else { st.playing = !st.playing; syncPlayButton(); } });
  $("prev").addEventListener("click", () => { if (st.mode === "play") st.mode = "pose"; setMode("pose"); setPose(st.poseIdx - 1); });
  $("next").addEventListener("click", () => { if (st.mode === "play") st.mode = "pose"; setMode("pose"); setPose(st.poseIdx + 1); });
  const step = (n) => { st.playing = false; syncPlayButton(); st.t = wrap(st.t + n * frameDt, false); };
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
  jog.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } });

  // 회전 슬라이더 ↔ 3D
  function syncAzimuth() { if (!figure) return; const d = Math.round(figure.orbit.azimuthDeg()); $("azimuth").value = d; setText($("azimuth-out"), `${d}°`); }
  $("azimuth").addEventListener("input", (e) => { figure?.orbit.setAzimuthDeg(Number(e.target.value)); setText($("azimuth-out"), `${e.target.value}°`); });
  if (figure) figure.onOrbitChange = syncAzimuth;

  // 단축키는 아무것도 포커스되지 않았을 때만 (버튼·입력·표 행에서는 그 요소가 처리)
  window.addEventListener("keydown", (e) => {
    if (e.target !== document.body) return;
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

  // 그릴 것이 바뀌었는지는 렌더 입력을 지난번과 비교해 정한다 — 상태를 바꾸는 쪽이 신경 쓸 일이 없다
  let lastKey = null, last = performance.now(), tableAt = 0, scoreAt = 0;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (st.playing) st.t = wrap(st.t + dt * st.speed);
    if (st.mode === "play" && hasPoses) {
      const i = poseIndexAt(timedSeq, st.t);
      if (i >= 0 && i !== st.poseIdx) { st.poseIdx = i; renderPoseCards(); }
    }
    const key = `${st.t}|${st.poseIdx}|${st.mode}|${st.ghost}|${st.showRef}|${st.selectedAngle}|${st.range[0]}`;
    const poseChanged = key !== lastKey;
    const userChanged = st.userLm !== tick.lastUser;
    if (poseChanged || userChanged) {
      lastKey = key; tick.lastUser = st.userLm;
      const lm = frameAt(seq, st.t);
      if (figure) {
        figure.setPose(lm);
        const p = poseAt(st.poseIdx);
        const ghostT = st.ghost && st.mode === "transition" ? st.range[0]
          : st.ghost && st.mode === "play" && st.poseIdx > 0 ? poseAt(st.poseIdx - 1).key : null;
        figure.setGhost(ghostT == null ? null : frameAt(seq, ghostT));
        figure.setRef(st.showRef && p?.ref ? alignToPose(p.ref, lm) : null);
        figure.setUser(st.userLm ? alignToPose(st.userLm, lm) : null);
      }
      $("scrub").value = st.t;
      setText($("clock"), `${st.t.toFixed(2)}s`);
      // 각도표는 12Hz, 일치도는 7Hz — 멈춰 있을 때 시각이 바뀌면 즉시
      const due = (at, ms) => now - at >= ms || (poseChanged && !st.playing);
      if (due(tableAt, 80) || due(scoreAt, 150)) {
        const cur = jointAngles(lm), me = st.userLm ? jointAngles(st.userLm) : null;
        if (due(tableAt, 80)) { tableAt = now; updateAngleTable(cur, me); }
        if (st.cam && due(scoreAt, 150)) { scoreAt = now; updateScore(cur, me); }
      }
      figure?.render();
      updateLabels(lm);
    } else if (figure?.needsRender) {
      figure.render();                 // 시점만 바뀐 경우: 자세 계산 없이 그리기만
      updateLabels(frameAt(seq, st.t));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
