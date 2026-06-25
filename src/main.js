import * as THREE from "three";
import evo from "../data/evo.js"; // C1/C2: inline ESM data, no fetch()
import { championOf, easeOut } from "./ga.js";
import {
  buildField,
  buildGrid,
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

if (!renderer) {
  canvas.classList.add("webgl-failed");
  // page is fully usable: gradient + title + contact + HUD remain.
} else {
  runThree();
}

function runThree() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // keep CSS gradient visible if alpha

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3.6);

  // a rotatable wrapper so the field AND tower rotate by the SAME amount (H1)
  const world = new THREE.Group();
  scene.add(world);

  const grid = buildGrid();
  const field = buildField(generation);
  const pareto = buildPareto(generation);
  const tower = buildTower(generation);

  world.add(grid);
  world.add(field);
  if (pareto) world.add(pareto);
  world.add(tower);

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
  const pulseMats = tower.userData.pulseMats || [];
  const handoffMats = tower.userData.handoffMats || [];

  const smoothMouse = new THREE.Vector2(99, 99);
  const t0 = performance.now();

  // reduced-motion: render the FINAL (converged) generation once, frozen.
  // No generation loop, no morph, no handoff — HUD already shows final values.
  if (REDUCED) {
    fieldU.uIntroT.value = 1;
    fieldU.uMorph.value = 1;
    fieldU.uTime.value = 0;
    if (paretoMat) paretoMat.uniforms.uTime.value = 0;
    pulseMats.forEach((m) => (m.uniforms.uTime.value = 0));
    renderer.render(scene, camera);
    // still respond to resize (re-render once)
    addEventListener("resize", () => renderer.render(scene, camera));
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
    fieldU.uIntroT.value = Math.min(1, t / 1.4); // 1.4s rush-in (first paint)
    fieldU.uScroll.value = scrollProgress();

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
    pulseMats.forEach((m) => (m.uniforms.uTime.value = t));

    // ambient: a very slow whole-field rotation (H1 — Object3D, so the tower
    // group rotates with it and stays on the champion). LOW amplitude so the
    // generational "breath" stays the one focal motion (DESIGN motion system).
    world.rotation.z = Math.sin(t * 0.05) * 0.04;

    // OPTIONAL: feed audio energy into the field as a SUBTLE breathing dolly.
    // Pure camera micro-move — cannot touch/break the shader. Idles at 3.6.
    const energy = audio.getEnergy ? audio.getEnergy() : 0;
    camera.position.z = 3.6 - energy * 0.12;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
