import * as THREE from "three";
import evo from "../data/evo.js"; // C1/C2: inline ESM data, no fetch()
import { championOf, easeOut } from "./ga.js";
import {
  buildField,
  buildSurface,
  buildAxes,
  buildPareto,
  buildTower,
  updatePareto,
  moveTower,
  settleTower,
} from "./field.js";
import { buildAxisLabels } from "./axislabels.js";
import { decodeSequence, decodeElement } from "./decode.js";
import { scrollProgress } from "./scroll.js";
import { createAudio } from "./audio.js";
import { createVisualizer } from "./visualizer.js";
import { createPortal } from "./portal.js";
import projects from "../data/projects.js";
import { buildProjectNodes } from "./nodes.js";
import { setupProjectPanel, setupNodeTip, renderProjectsMirror } from "./projectui.js";

const REDUCED =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const TOUCH =
  typeof matchMedia === "function" &&
  matchMedia("(hover: none), (pointer: coarse)").matches;

// reduced-motion → show the FINAL (converged) generation statically; otherwise
// start at generation 0 and play forward.
const GEN_COUNT = evo.generations.length;
const startIndex = REDUCED ? GEN_COUNT - 1 : 0;
const generation = evo.generations[startIndex];
const canvas = document.getElementById("bg");

// ---------------------------------------------------------------------------
// Telemetry HUD text (from data) + machine-decode intro
// ---------------------------------------------------------------------------
// short, stable champion label (the synthetic ids are long e.g. "g15-25")
function champLabel(champ) {
  if (!champ) return "—";
  const m = String(champ.id).match(/(\d+)\D*$/);
  return m ? m[1].padStart(3, "0") : String(champ.id);
}

function telemetryLine(gen, fitness, champ) {
  return `GEN ${String(gen).padStart(3, "0")} · FITNESS ${fitness.toFixed(2)} · CHAMP #${champLabel(champ)}`;
}

const telEl = document.getElementById("telemetry-line");

function setupTelemetry() {
  const champ = championOf(generation);
  const fit = champ?.fitness ?? 0;
  const line = telemetryLine(generation.generation, fit, champ);
  telEl.setAttribute("data-decode", line);
  telEl.textContent = line;

  // decode the title block + telemetry, staggered, once on load
  const decodeEls = [telEl, ...document.querySelectorAll(".titleblock .decode")];
  decodeSequence(decodeEls, { stagger: 120, duration: 650 });
  return { fit };
}

/**
 * Live HUD updater. GEN snaps to the new value, FITNESS counts up smoothly from
 * the previous best to the new best over the step, CHAMP id flashes a quick
 * decode when the champion changes.
 */
function makeHud(initialFit) {
  let shownFit = initialFit;
  let flashing = false; // a decode flash owns the element until it resolves
  return {
    update(gen, targetFit, champ, championChanged) {
      // smooth count-up toward the new best fitness
      shownFit += (targetFit - shownFit) * 0.18;
      if (Math.abs(targetFit - shownFit) < 0.004) shownFit = targetFit;
      const line = telemetryLine(gen, shownFit, champ);
      if (championChanged && !flashing) {
        // quick decode/typewriter flash on champion handoff (fires ONCE)
        flashing = true;
        telEl.setAttribute("data-decode", line);
        decodeElement(telEl, line, { duration: 420 }).then(() => {
          flashing = false;
        });
      } else if (!flashing) {
        telEl.textContent = line;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Cursor reticle + coordinate readout + objective-space mapping
// ---------------------------------------------------------------------------
const reticle = document.getElementById("reticle");
const coordEl = document.getElementById("coordreadout");
// pointer in NDC (-1..1) for the shader cursor probe
const mouseObj = new THREE.Vector2(99, 99); // off-field until moved
let pointerActive = false;

function setupCursor() {
  if (TOUCH || REDUCED) return; // desktop-only scientific highlighting
  addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      pointerActive = true;
      reticle.classList.add("live");
      coordEl.classList.add("live");
      reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      coordEl.style.transform = `translate(${e.clientX + 26}px, ${e.clientY + 14}px)`;

      // screen → objective space. Field spans roughly the central viewport.
      const nx = (e.clientX / innerWidth) * 2 - 1; // -1..1
      const ny = -((e.clientY / innerHeight) * 2 - 1);
      mouseObj.set(nx, ny);
      // objective readout 0..1 (clamped, like a chart cursor)
      const ox = Math.min(1, Math.max(0, (nx + 1) / 2));
      const oy = Math.min(1, Math.max(0, (ny + 1) / 2));
      coordEl.textContent = `obj[${ox.toFixed(2)}, ${oy.toFixed(2)}]`;
    },
    { passive: true }
  );
  addEventListener("pointerleave", () => {
    reticle.classList.remove("live");
    coordEl.classList.remove("live");
    mouseObj.set(99, 99);
  });
}

// ---------------------------------------------------------------------------
// FACE PORTAL DOM wiring — the entry affordance is keyboard/SR accessible.
//   Entry gestures (any of): click the Enter button, click the canvas/portrait,
//   press Enter/Space anywhere, or scroll. A separate "skip intro" jumps to
//   STATE B with no motion. dismissPortalOverlay() fades the overlay + removes
//   it from the a11y tree, then moves focus to the now-revealed title block.
// ---------------------------------------------------------------------------
const portalEl = document.getElementById("portal");
const portalEnterBtn = document.getElementById("portal-enter");
const portalSkipBtn = document.getElementById("portal-skip");
document.body.classList.add("portal-active");

// fade the portal COPY out the moment entry starts (the particle scatter is the
// star of the transition); the STATE-B chrome (title block, HUD) stays hidden
// via body.portal-active until the journey completes — see revealStateB().
let copyFaded = false;
function fadePortalCopy() {
  if (copyFaded) return;
  copyFaded = true;
  if (portalEl) {
    portalEl.classList.add("portal-gone");
    portalEl.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      portalEl.querySelectorAll("button").forEach((b) => (b.tabIndex = -1));
    }, 650);
  }
}

// reveal STATE B (title block + HUD) and move keyboard focus into it. Called at
// hand-off (transition complete) or immediately for the no-motion paths.
let stateBRevealed = false;
function revealStateB() {
  if (stateBRevealed) return;
  stateBRevealed = true;
  document.body.classList.remove("portal-active");
  const focusTarget =
    document.querySelector(".titleblock .contact a") ||
    document.querySelector(".titleblock");
  if (focusTarget) {
    if (!focusTarget.hasAttribute("tabindex") && focusTarget.tagName !== "A") {
      focusTarget.setAttribute("tabindex", "-1");
    }
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (_) {}
  }
}

// no-motion / fallback dismiss: fade the copy AND reveal STATE B at once.
function dismissPortalOverlay() {
  fadePortalCopy();
  revealStateB();
}

// wire entry (enter) + skip (skip). Listeners are removed once entry fires so a
// scroll deep in STATE B never re-triggers anything.
function wirePortalEntry(enter, skip) {
  let fired = false;
  const fire = (fn) => () => {
    if (fired) return;
    fired = true;
    cleanup();
    fn();
  };
  const onEnter = fire(enter);
  const onSkip = fire(skip);

  function onKey(e) {
    if (copyFaded) return; // entry already started
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      // let the actual buttons handle their own activation
      if (e.target === portalEnterBtn || e.target === portalSkipBtn) return;
      e.preventDefault();
      onEnter();
    }
  }
  function onScroll() {
    if (scrollY > 4) onEnter();
  }
  function onCanvasClick() {
    onEnter();
  }

  if (portalEnterBtn) portalEnterBtn.addEventListener("click", onEnter);
  if (portalSkipBtn) portalSkipBtn.addEventListener("click", onSkip);
  canvas.addEventListener("click", onCanvasClick);
  addEventListener("keydown", onKey);
  addEventListener("scroll", onScroll, { passive: true });

  function cleanup() {
    if (portalEnterBtn) portalEnterBtn.removeEventListener("click", onEnter);
    if (portalSkipBtn) portalSkipBtn.removeEventListener("click", onSkip);
    canvas.removeEventListener("click", onCanvasClick);
    removeEventListener("keydown", onKey);
    removeEventListener("scroll", onScroll);
  }
}

// reduced-motion: the portal is a STATIC portrait/copy; the Enter + skip buttons
// (and Enter/Space) simply dismiss the overlay with no zoom. `after` runs once.
function wirePortalDismiss(after) {
  const go = () => {
    dismissPortalOverlay();
    after();
  };
  wirePortalEntry(go, go);
}

// ---------------------------------------------------------------------------
// AETHER audio player + audio-reactive visualizer (bottom-right dock)
//   - never autoplays (created/resumed on a user gesture inside createAudio)
//   - reduced-motion → visualizer draws a single calm baseline (no rAF)
// ---------------------------------------------------------------------------
const audio = createAudio({
  playBtn: document.getElementById("audio-play"),
  stopBtn: document.getElementById("audio-stop"),
  muteBtn: document.getElementById("audio-mute"),
  volSlider: document.getElementById("audio-vol"),
  statusEl: document.getElementById("audio-status"),
});
createVisualizer({
  canvas: document.getElementById("viz"),
  audio,
  reduced: REDUCED,
});

// Browser-honest autoplay: try to start on load; if blocked, the audio module
// arms a one-time first-gesture listener. Skipped when reduced-motion is set
// (the module also skips when the localStorage mute flag is on).
audio.autostart({ skip: REDUCED });

// ---------------------------------------------------------------------------
// WebGL — guarded. On failure, hide canvas and leave CSS gradient + content.
// ---------------------------------------------------------------------------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  console.warn("[moon-ai-tower] WebGL unavailable, using CSS fallback:", err);
}

setupTelemetry();
setupCursor();
// crawlable + screen-reader project mirror (single source: data/projects.js).
// Rendered regardless of WebGL so search engines / assistive tech get real text.
renderProjectsMirror(projects, document.documentElement.lang || "en");

if (!renderer) {
  canvas.classList.add("webgl-failed");
  // No WebGL → no particle portrait. Dismiss the portal overlay so the static
  // fallback page (gradient + title + contact + HUD) is immediately usable; the
  // Enter/skip buttons + Enter key still work as a no-op dismiss.
  wirePortalDismiss(() => {});
  dismissPortalOverlay();
} else {
  runThree();
}

function runThree() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // keep CSS gradient visible if alpha

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);

  // ---- 3/4 ISOMETRIC-ISH RIG (matches the reference) ----------------------
  // The landscape is modelled in the XY plane with +Z = fitness (up). We tilt a
  // pivot so +Z reads as "up the screen" and view it from a 3/4 angle. A slow
  // ambient orbit + scroll-driven dolly live on this rig — never a full spin.
  const rig = new THREE.Group(); // yaw (ambient orbit + scroll)
  const tilt = new THREE.Group(); // fixed lookdown tilt
  const world = new THREE.Group(); // holds the landscape, centered
  rig.add(tilt);
  tilt.add(world);
  scene.add(rig);

  // tip the plane back so we look DOWN onto the surface at a 3/4 angle.
  // ~55° from horizontal reads like the reference iso plot.
  tilt.rotation.x = -Math.PI * 0.30;
  // baseline 3/4 yaw so peaks + valleys don't line up flat
  const BASE_YAW = -0.62;
  rig.rotation.z = BASE_YAW;
  const CAM_Z = 4.9; // pulled back so the whole surface frames in
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  const surface = buildSurface();
  const axes = buildAxes();
  const field = buildField(generation);
  const pareto = buildPareto(generation);
  const tower = buildTower(generation);

  // lower the landscape so the surface sits in the centre/lower frame, leaving
  // headroom for the floating × and the title block in the lower-left.
  world.position.set(0, -0.15, -0.4);
  world.add(surface);
  world.add(axes);
  world.add(field);
  if (pareto) world.add(pareto);
  world.add(tower);

  // ---- PROJECT NODES: curated thermal markers floating over the landscape ---
  // Added to `world` so they inherit the rig/tilt transform and hide with the
  // world during the portal. Pure placement lives in nodes.js (tested).
  const { group: projectGroup, meshes: projectMeshes } = buildProjectNodes(THREE, projects);
  world.add(projectGroup);

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2(-2, -2); // offscreen until the mouse moves
  let hovered = null;
  const focus = { active: false, mesh: null }; // fly-to target
  let returning = false;
  const _wp = new THREE.Vector3();
  const _dest = new THREE.Vector3();
  const HOME = new THREE.Vector3(0, 0, CAM_Z);

  const nodeTip = setupNodeTip();
  const panel = setupProjectPanel(() => {
    // closing the panel flies the camera home and resumes the ambient orbit
    focus.active = false;
    focus.mesh = null;
    returning = true;
    hovered = null;
    nodeTip.hide();
    document.body.classList.remove("node-hover");
  });

  const nodesInteractive = () => entered && world.visible && (!portal || portal.isDone());
  const ndcFromEvent = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointerNDC.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  };

  if (!TOUCH) {
    renderer.domElement.addEventListener("pointermove", ndcFromEvent, { passive: true });
  }
  renderer.domElement.addEventListener("click", (e) => {
    if (!nodesInteractive()) return; // let the portal own pre-entry clicks
    ndcFromEvent(e);
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.intersectObjects(projectMeshes, false)[0];
    if (!hit) return;
    e.stopPropagation();
    panel.show(hit.object.userData.project, document.documentElement.lang || "en");
    focus.active = true;
    focus.mesh = hit.object;
    returning = false;
    nodeTip.hide();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.isOpen()) panel.hide();
  });

  // axis labels overlay (DOM)
  buildAxisLabels(document.body);

  // ---- resize: update size, projection, pixel ratio AND uPixelRatio (M2) ----
  function resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    // guard: field may not exist in some future path; here it always does
    if (field && field.material.uniforms.uPixelRatio) {
      field.material.uniforms.uPixelRatio.value = dpr;
    }
  }
  addEventListener("resize", resize);
  resize();

  const fieldU = field.material.uniforms;
  const paretoMat = pareto ? pareto.material : null;
  const surfaceMat = surface.userData.fillMat || null;
  const pulseMats = tower.userData.pulseMats || [];
  const handoffMats = tower.userData.handoffMats || [];

  const smoothMouse = new THREE.Vector2(99, 99);
  const t0 = performance.now();

  // reduced-motion: NO portal zoom journey. Dismiss the portrait overlay and
  // render the FINAL (converged) landscape once, frozen. The portal DOM offers
  // a normal "Enter →" button that just removes the overlay (no motion).
  if (REDUCED) {
    fieldU.uIntroT.value = 1;
    fieldU.uMorph.value = 1;
    fieldU.uTime.value = 0;
    if (paretoMat) paretoMat.uniforms.uTime.value = 0;
    if (surfaceMat) surfaceMat.uniforms.uTime.value = 0;
    pulseMats.forEach((m) => (m.uniforms.uTime.value = 0));
    // static converged frame: no orbit, no generation loop, fixed 3/4 angle.
    renderer.render(scene, camera);
    addEventListener("resize", () => renderer.render(scene, camera));
    // a focusable Enter/skip button still dismisses the static portal overlay.
    wirePortalDismiss(() => {}); // no transition, just hide the overlay
    return;
  }

  // -------------------------------------------------------------------------
  // GENERATION PLAYBACK STATE MACHINE
  //   - advance one generation every STEP_MS
  //   - on advance: retarget field, recompute pareto, move tower
  //   - field MORPHS (uMorph 0→1, eased ~MORPH_MS) — "breathing" lerp
  //   - champion change → old explodes (uExplode 0→1) then new rushes in
  //   - HUD: GEN snaps, FITNESS counts up, CHAMP flashes on change
  //   - last gen → hold, then soft-reset (jump-cut) back to gen 0
  // -------------------------------------------------------------------------
  const STEP_MS = evo.meta?.stepMs ?? 2800;
  const MORPH_MS = 1200; // field lerp duration (ease)
  const EXPLODE_MS = 380; // old-champion blow-out
  const INTRO_MS = 620; // new-champion rush-in
  const HOLD_MS = 2600; // converged hold at the last generation

  const hud = makeHud(championOf(generation)?.fitness ?? 0);

  let genIndex = startIndex;
  let lastStep = performance.now() + 900; // small delay so the rush-in lands first
  let morphStart = -1; // timestamp morph began (-1 = idle)
  // champion handoff sub-state: 'idle' | 'explode' | 'intro'
  let handoff = "idle";
  let handoffStart = 0;
  let pendingChamp = null;

  // -------------------------------------------------------------------------
  // FACE PORTAL (STATE A) gating. While the portrait is up, the landscape is
  // held hidden (surface uReveal=0, particle rush-in frozen). The landscape's
  // OWN intro begins only at hand-off, so the GA "rushes in" as the portrait
  // scatters into it. `entered` flips true once we've landed in STATE B; until
  // then the generation clock is paused so the visitor isn't dropped mid-run.
  // -------------------------------------------------------------------------
  let portal = null;
  let portalPending = true; // true until the portrait loads (or fails) — hold STATE A
  let entered = false; // true once in STATE B (landscape playing)
  let landscapeT0 = 0; // performance.now() when the landscape intro begins

  function beginLandscape() {
    if (entered) return;
    entered = true;
    landscapeT0 = performance.now();
    lastStep = landscapeT0 + 900; // first generation step lands after rush-in
    revealStateB(); // bring in the title block + HUD now that we've landed
  }

  // hold the landscape hidden until the portal hands off (whole world group off
  // so faint axes/pareto/tower don't bleed through the clean portrait scene)
  function holdLandscapeHidden() {
    fieldU.uIntroT.value = 0;
    if (surfaceMat) surfaceMat.uniforms.uReveal.value = 0;
    world.visible = false;
  }

  // create the portrait portal (skipped on reduced-motion via the early return
  // above). If the image fails to load, we fall back to entering immediately.
  holdLandscapeHidden();
  createPortal({
    scene,
    camera,
    src: "./assets/portrait.png",
    touch: TOUCH,
    onComplete: beginLandscape,
  })
    .then((p) => {
      portal = p;
      portalPending = false;
      // any of: click the portrait/canvas, press Enter/Space, click the Enter
      // button, scroll, or click skip → start the zoom-into-brain transition.
      const enter = () => {
        // the entry gesture also satisfies the audio first-gesture (BGM start)
        if (!REDUCED && !audio.isMuted?.()) audio.play?.();
        if (!portal.startTransition()) return;
        fadePortalCopy(); // copy fades now; STATE-B chrome waits for hand-off
      };
      wirePortalEntry(enter, () => {
        // skip = jump straight to STATE B with no scatter (not a trap)
        if (portal.getState() === "portrait") {
          portal.skipInstant(); // calls onComplete → beginLandscape → revealStateB
          fadePortalCopy();
        }
      });
    })
    .catch((err) => {
      console.warn("[moon-ai-tower] portrait portal unavailable, entering directly:", err);
      portalPending = false;
      dismissPortalOverlay();
      beginLandscape();
    });

  function advanceGeneration() {
    const next = (genIndex + 1) % GEN_COUNT;
    const looping = next === 0; // soft reset back to gen 0
    genIndex = next;
    const gen = evo.generations[genIndex];

    // field morph + pareto recompute
    field.userData.retarget(gen);
    morphStart = performance.now();
    updatePareto(pareto, gen);

    // champion handoff
    const { changed, champ } = moveTower(tower, gen);
    if (changed && !looping) {
      // old explodes, then new rushes in (design beat)
      handoff = "explode";
      handoffStart = performance.now();
      pendingChamp = champ;
    } else {
      // no change (or loop reset) → just settle on the new champion
      settleTower(tower, champ);
      handoffMats.forEach((m) => (m.uniforms.uIntro.value = 1));
    }
  }

  function loop(now) {
    const t = (now - t0) / 1000;

    fieldU.uTime.value = t;
    fieldU.uScroll.value = scrollProgress();

    // ---- FACE PORTAL: hold STATE B hidden until the portrait has loaded -----
    if (portalPending) {
      if (surfaceMat) surfaceMat.uniforms.uReveal.value = 0;
      fieldU.uIntroT.value = 0;
      rig.rotation.z = BASE_YAW;
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
      return;
    }

    // ---- FACE PORTAL: drive STATE A + the zoom-into-brain transition --------
    if (portal && !portal.isDone()) {
      const st = portal.update(now);
      // landscape fades in (surface alpha + particle rush-in) as the portrait
      // scatters. `st.landscape` is 0 during STATE A, ramps in mid-transition.
      const rev = st.landscape || 0;
      world.visible = rev > 0.001; // reveal the GA world as it pushes in
      if (surfaceMat) surfaceMat.uniforms.uReveal.value = rev;
      fieldU.uIntroT.value = rev; // the GA "rushes in" beneath the scatter
      // keep the rest of the landscape paused (no generation clock yet)
      if (paretoMat) paretoMat.uniforms.uTime.value = t;
      if (surfaceMat) surfaceMat.uniforms.uTime.value = t;
      pulseMats.forEach((m) => (m.uniforms.uTime.value = t));
      rig.rotation.z = BASE_YAW + Math.sin(t * 0.045) * 0.06;
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
      return;
    }

    // ---- STATE B: normal landscape playback (portal done / never created) ---
    if (!entered) beginLandscape();
    world.visible = true;
    if (surfaceMat) surfaceMat.uniforms.uReveal.value = 1;
    const lt = (now - landscapeT0) / 1000;
    fieldU.uIntroT.value = Math.min(1, lt / 1.4); // 1.4s rush-in at hand-off

    // ---- step timer ----
    const atLast = genIndex === GEN_COUNT - 1;
    const interval = atLast ? STEP_MS + HOLD_MS : STEP_MS;
    if (now - lastStep >= interval) {
      lastStep = now;
      advanceGeneration();
    }

    // ---- field morph (eased lerp of particle positions/size/brightness) ----
    if (morphStart >= 0) {
      const mt = Math.min(1, (now - morphStart) / MORPH_MS);
      fieldU.uMorph.value = easeOut(mt);
      if (mt >= 1) morphStart = -1;
    }

    // ---- champion handoff beat ----
    if (handoff === "explode") {
      const et = Math.min(1, (now - handoffStart) / EXPLODE_MS);
      handoffMats.forEach((m) => (m.uniforms.uExplode.value = et));
      if (et >= 1) {
        // relocate to new champion, then rush it in
        settleTower(tower, pendingChamp);
        handoffMats.forEach((m) => (m.uniforms.uIntro.value = 0));
        handoff = "intro";
        handoffStart = now;
      }
    } else if (handoff === "intro") {
      const it = Math.min(1, (now - handoffStart) / INTRO_MS);
      handoffMats.forEach((m) => (m.uniforms.uIntro.value = easeOut(it)));
      if (it >= 1) handoff = "idle";
    }

    // ---- HUD: count FITNESS up, GEN snap, CHAMP flash on handoff ----
    const gen = evo.generations[genIndex];
    const champ = championOf(gen);
    hud.update(gen.generation, champ?.fitness ?? 0, champ, handoff === "explode");

    // smooth cursor probe
    if (pointerActive && mouseObj.x < 90) smoothMouse.lerp(mouseObj, 0.12);
    else smoothMouse.lerp(new THREE.Vector2(99, 99), 0.05);
    fieldU.uMouse.value.copy(smoothMouse);

    // pulses
    if (paretoMat) paretoMat.uniforms.uTime.value = t;
    if (surfaceMat) surfaceMat.uniforms.uTime.value = t;
    pulseMats.forEach((m) => (m.uniforms.uTime.value = t));

    // ---- project node hover (desktop): scale + cursor + name tip ----
    if (!TOUCH && nodesInteractive() && !focus.active) {
      raycaster.setFromCamera(pointerNDC, camera);
      const hit = raycaster.intersectObjects(projectMeshes, false)[0];
      const next = hit ? hit.object : null;
      if (next !== hovered) {
        if (hovered) hovered.scale.setScalar(1);
        hovered = next;
        if (hovered) hovered.scale.setScalar(1.6);
        document.body.classList.toggle("node-hover", !!hovered);
        nodeTip.show(hovered ? hovered.userData.project.name : null);
      }
    }

    // ambient camera: slow LOW-amplitude orbit (drift, NOT a full spin) around
    // the landscape. Scroll maps to a gentle additional orbit + dolly-in (the
    // reference 3/4 angle is the home pose). DESIGN: one focal motion = the
    // generational breath; the orbit stays subtle.
    const scroll = scrollProgress();
    const energy = audio.getEnergy ? audio.getEnergy() : 0;

    if (focus.active && focus.mesh) {
      // fly-to: freeze the ambient orbit (so the marker doesn't drift out from
      // under us) and lerp the camera to frame the node, looking right at it.
      focus.mesh.getWorldPosition(_wp);
      _dest.set(_wp.x, _wp.y, _wp.z + 1.8);
      camera.position.lerp(_dest, REDUCED ? 1 : 0.08);
      camera.lookAt(_wp);
    } else {
      rig.rotation.z = BASE_YAW + Math.sin(t * 0.045) * 0.06 + scroll * 0.5;
      if (returning) {
        // fly home, restoring the original look-at-origin pose, then resume
        camera.position.lerp(HOME, REDUCED ? 1 : 0.1);
        camera.lookAt(0, 0, 0);
        if (REDUCED || camera.position.distanceTo(HOME) < 0.02) {
          camera.position.copy(HOME);
          camera.lookAt(0, 0, 0);
          returning = false;
        }
      } else {
        // SUBTLE dolly: audio energy + scroll pull the camera gently in.
        camera.position.z = CAM_Z - energy * 0.12 - scroll * 0.5;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
