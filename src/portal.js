import * as THREE from "three";
import { samplePortrait, transitionPhases, easeInOut } from "./portrait.js";

// ===========================================================================
// FACE PORTAL — the signature opening interaction (STATE A + the transition).
//
//   STATE A: a glowing PARTICLE PORTRAIT of the site owner, sampled from
//   assets/portrait.png, rendered as the same additive aurora particles as the
//   GA field. Gentle drift/shimmer + a "▸ CLICK TO ENTER" affordance.
//
//   TRANSITION (on click/tap/Enter/scroll): the camera dollies "into" the head
//   while the portrait particles scatter/stream through depth (a brief neural /
//   DNA beat — radial swirl + helical twist along Z), crossfading as the GA
//   landscape pushes in. Then we hand off to the existing landscape playback.
//
//   The landscape (STATE B) is untouched: this module renders the portrait as a
//   separate THREE.Points object added to the SAME scene, in FRONT of the
//   landscape, and drives a transition `progress` 0..1 (pure curves from
//   portrait.js) that the host loop applies each frame.
// ===========================================================================

// per-particle tint is precomputed on the CPU (palette from portrait.js) and
// handed in as the aColor attribute — the vertex shader just forwards it.
const PORTRAIT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uReveal;     // 0..1 assembly-in on first paint
  uniform float uScatter;    // 0..1 zoom-into-brain scatter/stream
  uniform vec3  uHead;       // world-space head focus (scatter pivot)

  attribute vec3  aColor;    // CPU palette tint
  attribute float aSize;
  attribute float aBright;
  attribute vec3  aSeed;     // per-particle randoms
  attribute vec3  aScatter;  // per-particle scatter direction

  varying float vBright;
  varying vec3  vCol;
  varying float vScatterFade;

  void main() {
    vec3 p = position;

    // ---- assembly-in: particles rush in from a shell toward their pixel home
    float rv = smoothstep(0.0, 1.0, uReveal);
    vec3 shell = p + aScatter * 2.2 + vec3(0.0, 0.0, -3.0);
    p = mix(shell, p, rv);

    // ---- ambient drift / shimmer (low amplitude, "alive") -------------------
    float drift = rv * (1.0 - uScatter);
    p.x += sin(uTime * 0.5 + aSeed.x * 6.28) * 0.012 * drift;
    p.y += cos(uTime * 0.43 + aSeed.y * 6.28) * 0.012 * drift;
    p.z += sin(uTime * 0.7 + aSeed.z * 6.28) * 0.02 * drift;

    // ---- scatter / neural-DNA beat -----------------------------------------
    // particles stream toward + past the head, twisting on a helix along depth
    // and swirling radially around the head axis → reads as "into the brain".
    float s = uScatter;
    if (s > 0.0) {
      // converge laterally toward the head axis (the figure collapses INTO the
      // head), swirl on a helix, and stream forward past the camera along +Z.
      vec2 toHead = p.xy - uHead.xy;
      float ang = s * (4.5 + aSeed.x * 5.0);            // helical twist amount
      float cs = cos(ang), sn = sin(ang);
      vec2 sw = vec2(toHead.x * cs - toHead.y * sn,
                     toHead.x * sn + toHead.y * cs);
      // pull toward the head axis (1-s shrinks the radius → converge on head)
      p.xy = uHead.xy + sw * (1.0 - s * 0.78);
      p.xy += aScatter.xy * s * 0.35;                   // faint outward shimmer
      // stream forward (toward + past the camera) so we punch "into" the head
      p.z += s * (4.0 + aSeed.z * 4.0);
    }

    vCol = aColor;
    vBright = aBright;
    // particles streaming past the camera dim out so the scatter doesn't smear
    vScatterFade = 1.0 - smoothstep(0.6, 1.0, uScatter) * step(1.5, p.z);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float sizeBoost = 1.0 + uScatter * 1.5;             // streaks grow as they fly
    gl_PointSize = clamp(aSize * sizeBoost * uPixelRatio * (52.0 / -mv.z), 1.0, 64.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
  }
`;

const PORTRAIT_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying float vBright;
  varying vec3  vCol;
  varying float vScatterFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;
    float a = smoothstep(0.5, 0.0, dist) * clamp(vBright, 0.05, 1.0);
    vec3 col = vCol + vec3(smoothstep(0.18, 0.0, dist) * 0.55);
    gl_FragColor = vec4(col, a * uOpacity * vScatterFade);
  }
`;

/**
 * Load an image element. Resolves with the HTMLImageElement (decoded).
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = (e) => reject(e);
    im.src = src;
  });
}

/**
 * Draw an image to an offscreen canvas (downscaled to maxDim on the long edge to
 * keep getImageData fast) and return { width, height, data } RGBA.
 */
function imageToPixels(img, maxDim = 700) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data };
}

/**
 * Build the particle-portrait THREE.Points from a sampled-pixel buffer.
 * @returns {{ points: THREE.Points, uniforms, head: THREE.Vector3, sample }}
 */
export function buildPortraitPoints(pixels, opts = {}) {
  const {
    targetCount = 7000,
    planeH = 2.7,
    centerY = 0.15,
    pixelRatio = Math.min(devicePixelRatio || 1, 2),
  } = opts;

  const sample = samplePortrait(pixels, {
    targetCount,
    planeH,
    centerY,
    alphaThreshold: 48,
    lumaFloor: 0.05,
    depthJitter: 0.06,
  });
  const n = sample.count;

  // per-particle seeds + scatter directions (radial-ish from plane center)
  const seed = new Float32Array(n * 3);
  const scatter = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = Math.random();
    seed[i * 3 + 1] = Math.random();
    seed[i * 3 + 2] = Math.random();
    const px = sample.positions[i * 3];
    const py = sample.positions[i * 3 + 1] - centerY;
    const len = Math.hypot(px, py) || 1;
    scatter[i * 3] = (px / len) * (0.5 + Math.random());
    scatter[i * 3 + 1] = (py / len) * (0.5 + Math.random());
    scatter[i * 3 + 2] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(sample.positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(sample.colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sample.sizes, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(sample.brights, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  geo.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3));

  // head focus: upper portion of the figure (where the face/brain sits). The
  // cutout is an upper-body shot, so the head is near the top of the plane.
  const head = new THREE.Vector3(0, centerY + planeH * 0.34, 0.2);

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uReveal: { value: 0 },
    uScatter: { value: 0 },
    uOpacity: { value: 1 },
    uHead: { value: head },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: PORTRAIT_VERT,
    fragmentShader: PORTRAIT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false, // sit in front; the landscape fades in beneath
    blending: THREE.AdditiveBlending,
    uniforms,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, uniforms, head, sample };
}

/**
 * Create the portal: loads the portrait, builds the points, and exposes a small
 * controller the host (main.js) drives. The host owns the renderer/scene/camera
 * and the landscape; the portal only adds its Points + reports transition state.
 *
 * @param {object} cfg
 * @param {THREE.Scene} cfg.scene
 * @param {THREE.Camera} cfg.camera
 * @param {string} cfg.src portrait image url
 * @param {boolean} cfg.touch coarse pointer → lower particle budget
 * @param {(p:number)=>void} cfg.onProgress called each frame of the transition with 0..1
 * @param {()=>void} cfg.onComplete called once when the transition lands in STATE B
 * @returns {Promise<object>} controller
 */
export async function createPortal(cfg) {
  const { scene, camera, src, touch = false, onProgress, onComplete } = cfg;

  const targetCount = touch ? 4200 : 7600;
  const img = await loadImage(src);
  const pixels = imageToPixels(img, touch ? 520 : 760);
  const { points, uniforms, head } = buildPortraitPoints(pixels, { targetCount });

  scene.add(points);

  // camera home (STATE A) + head-zoom target (end of dolly)
  const camHome = camera.position.clone();
  const camTarget = head.clone().add(new THREE.Vector3(0, 0, 1.15)); // close to the head

  let state = "portrait"; // 'portrait' | 'transition' | 'done'
  let tStart = 0;
  const DURATION_MS = 2100;
  let revealStart = performance.now();
  const REVEAL_MS = 1400;

  function startTransition() {
    if (state !== "portrait") return false;
    state = "transition";
    tStart = performance.now();
    return true;
  }

  // called every frame by the host BEFORE it renders. Returns the current phase
  // so the host can fade the landscape in / drive its own playback.
  function update(now) {
    // assembly-in shimmer reveal
    uniforms.uReveal.value = Math.min(1, (now - revealStart) / REVEAL_MS);
    uniforms.uTime.value = now / 1000;

    if (state === "portrait") {
      return { phase: "portrait", landscape: 0, scatter: 0 };
    }
    if (state === "transition") {
      const raw = Math.min(1, (now - tStart) / DURATION_MS);
      const ph = transitionPhases(raw);
      uniforms.uScatter.value = ph.scatter;
      uniforms.uOpacity.value = ph.portrait;
      // camera dollies from home → into the head
      camera.position.lerpVectors(camHome, camTarget, ph.dolly);
      if (onProgress) onProgress(raw);
      if (raw >= 1) {
        state = "done";
        points.visible = false;
        // restore the camera to the landscape home (host's loop took over)
        camera.position.copy(camHome);
        if (onComplete) onComplete();
      }
      return { phase: "transition", landscape: ph.landscape, scatter: ph.scatter, dolly: ph.dolly, raw };
    }
    return { phase: "done", landscape: 1, scatter: 0 };
  }

  // reduced-motion / instant entry: skip straight to STATE B with no scatter
  function skipInstant() {
    state = "done";
    points.visible = false;
    if (onProgress) onProgress(1);
    if (onComplete) onComplete();
  }

  return {
    points,
    uniforms,
    head,
    camHome,
    update,
    startTransition,
    skipInstant,
    isDone: () => state === "done",
    isPortrait: () => state === "portrait",
    getState: () => state,
  };
}

export { easeInOut, transitionPhases };
