import * as THREE from "three";
import evo from "../data/evo.js"; // C1/C2: inline ESM data, no fetch()
import { championOf } from "./ga.js";
import { buildField, buildGrid, buildPareto, buildTower } from "./field.js";
import { buildAxisLabels } from "./axislabels.js";
import { decodeSequence } from "./decode.js";
import { scrollProgress } from "./scroll.js";
import { createSound } from "./sound.js";

const REDUCED =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const TOUCH =
  typeof matchMedia === "function" &&
  matchMedia("(hover: none), (pointer: coarse)").matches;

const generation = evo.generations[0];
const canvas = document.getElementById("bg");

// ---------------------------------------------------------------------------
// Telemetry HUD text (from data) + machine-decode intro
// ---------------------------------------------------------------------------
function setupTelemetry() {
  const champ = championOf(generation);
  const gen = String(evo.meta?.generation ?? generation.generation).padStart(3, "0");
  const fit = (champ?.fitness ?? 0).toFixed(2);
  const line =
    `GEN ${gen} · FITNESS ${fit} · CHAMP #${champ?.id ?? "—"}`;
  const tel = document.getElementById("telemetry-line");
  tel.setAttribute("data-decode", line);
  tel.textContent = line;

  // decode the title block + telemetry, staggered, once on load
  const decodeEls = [
    tel,
    ...document.querySelectorAll(".titleblock .decode"),
  ];
  decodeSequence(decodeEls, { stagger: 120, duration: 650 });
  return { fit: champ?.fitness ?? 0 };
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
// Sound toggle
// ---------------------------------------------------------------------------
createSound({
  button: document.getElementById("sound-toggle"),
  icon: document.getElementById("sound-ico"),
  label: document.getElementById("sound-label"),
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

  const smoothMouse = new THREE.Vector2(99, 99);
  const t0 = performance.now();

  // reduced-motion: render the final state once, frozen.
  if (REDUCED) {
    fieldU.uIntroT.value = 1;
    fieldU.uTime.value = 0;
    if (paretoMat) paretoMat.uniforms.uTime.value = 0;
    pulseMats.forEach((m) => (m.uniforms.uTime.value = 0));
    renderer.render(scene, camera);
    // still respond to resize (re-render once)
    addEventListener("resize", () => renderer.render(scene, camera));
    return;
  }

  function loop(now) {
    const t = (now - t0) / 1000;

    fieldU.uTime.value = t;
    fieldU.uIntroT.value = Math.min(1, t / 1.4); // 1.4s rush-in
    fieldU.uScroll.value = scrollProgress();

    // smooth cursor probe
    if (pointerActive && mouseObj.x < 90) smoothMouse.lerp(mouseObj, 0.12);
    else smoothMouse.lerp(new THREE.Vector2(99, 99), 0.05);
    fieldU.uMouse.value.copy(smoothMouse);

    // pulses
    if (paretoMat) paretoMat.uniforms.uTime.value = t;
    pulseMats.forEach((m) => (m.uniforms.uTime.value = t));

    // ONE focal motion: a very slow whole-field rotation (H1 — Object3D, so the
    // tower group rotates with it and stays on the champion). Low amplitude.
    world.rotation.z = Math.sin(t * 0.05) * 0.06;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
