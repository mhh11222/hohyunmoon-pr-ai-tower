import * as THREE from "three";
import { genomeToParticle, paretoFront, championOf } from "./ga.js";

// satellites per genome → turns 6-18 dots into a real DENSE field (Eng fix H3)
const SATELLITES = 220;
const SAT_SPREAD = 0.085; // gaussian-ish radius around each genome in objective space

// ---------------------------------------------------------------------------
// PARTICLE FIELD (instrument scatter)
//   Eng fixes applied:
//     M3 — every uniform used in GLSL is declared in the uniform block
//     H2 — gl_PointSize clamped (40.0 base, not 300.0; clamp 1..64*dpr)
//     H1 — rotation is NOT baked into the shader; field.rotation.z is driven
//          on the Object3D so the tower group can rotate the same amount
// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uMouse;       // objective-space cursor position (-1..1)
  uniform float uIntroT;      // 0..1 rush-in
  uniform float uPixelRatio;
  uniform float uScroll;      // 0..1 scroll progress (declared even if subtle — M3)

  attribute vec3  aStart;     // off-screen start pos for rush-in
  attribute float aSize;
  attribute float aBright;
  attribute vec3  aSeed;      // per-particle randomness

  varying float vBright;
  varying vec3  vCol;

  // palette
  const vec3 BLUE  = vec3(0.04, 0.18, 0.78);
  const vec3 CYAN  = vec3(0.37, 0.92, 1.00); // ~ #5eeaff
  const vec3 GREEN = vec3(0.22, 0.95, 0.50); // ~ #38f27f

  void main() {
    // rush-in: lerp from off-screen start to final objective-space position
    vec3 pos = mix(aStart, position, smoothstep(0.0, 1.0, uIntroT));

    // slow ambient drift (low amplitude) — NOT a full-field rotation (that
    // lives on the Object3D so the tower can follow). Tiny per-particle wander.
    float drift = uIntroT; // freeze drift until rushed in
    pos.x += sin(uTime * 0.25 + aSeed.x * 6.28) * 0.012 * drift;
    pos.y += cos(uTime * 0.21 + aSeed.y * 6.28) * 0.012 * drift;

    // cursor "probe": gentle displacement + brighten near cursor (objective space)
    vec2 d = pos.xy - uMouse;
    float r2 = dot(d, d);
    float probe = exp(-r2 * 6.0);
    pos.z += probe * 0.22 * drift;

    // aurora colour = layered sine noise (cyan↔green), seeded
    float n1 = sin(pos.x * 1.6 + pos.y * 0.8 + uTime * 0.6) * 0.5 + 0.5;
    float n2 = sin(pos.y * 1.1 - pos.z * 1.3 + uTime * 0.5 + 1.7) * 0.5 + 0.5;
    float swirl = (n1 + n2) * 0.5 + (aSeed.x - 0.5) * 0.18;
    vec3 col = mix(BLUE, GREEN, swirl);
    col = mix(col, CYAN, (1.0 - abs(swirl - 0.5) * 2.0) * 0.5);

    vCol = col;
    vBright = aBright + probe * 0.6; // probe brightens

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    // H2: clamp point size so it can't explode to thousands of px
    gl_PointSize = clamp(aSize * uPixelRatio * (40.0 / -mv.z), 1.0, 64.0 * uPixelRatio);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vBright;
  varying vec3  vCol;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;
    float a = smoothstep(0.5, 0.0, dist) * clamp(vBright, 0.03, 1.0);
    vec3 col = vCol + vec3(smoothstep(0.16, 0.0, dist) * 0.5); // hot core
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Build the dense particle field. Returns a THREE.Points whose .rotation.z
 * the caller drives (H1). Each genome spawns SATELLITES satellite particles so
 * the scatter reads as a field, not a handful of dots.
 */
export function buildField(generation) {
  const genomes = generation.genomes;
  const N = genomes.length * SATELLITES;

  const pos = new Float32Array(N * 3);
  const start = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const bright = new Float32Array(N);
  const seed = new Float32Array(N * 3);

  let i = 0;
  genomes.forEach((g, gi) => {
    const base = genomeToParticle(g);
    for (let s = 0; s < SATELLITES; s++) {
      // gaussian-ish cluster: sum of two uniforms approximates a bell
      const rx = (Math.random() + Math.random() - 1) * SAT_SPREAD;
      const ry = (Math.random() + Math.random() - 1) * SAT_SPREAD;
      // density falloff: closer to centre = brighter/bigger
      const r = Math.hypot(rx, ry) / SAT_SPREAD; // 0 centre .. ~1 edge
      const falloff = 1 - Math.min(1, r) * 0.7;

      const px = base.x + rx;
      const py = base.y + ry;
      const pz = base.z * 0.12 + (Math.random() - 0.5) * 0.05;

      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;

      // rush-in from outside the frame, fanned by angle
      const ang = Math.random() * Math.PI * 2;
      const far = 4 + Math.random() * 3;
      start[i * 3] = px + Math.cos(ang) * far;
      start[i * 3 + 1] = py + Math.sin(ang) * far;
      start[i * 3 + 2] = pz - 6 - Math.random() * 4;

      size[i] = (1.6 + base.size * 0.12) * falloff + 0.4;
      bright[i] = Math.max(0.04, base.brightness * falloff);

      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = gi / genomes.length;
      i++;
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(99, 99) }, // off-field until cursor moves
      uIntroT: { value: 0 },
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      uScroll: { value: 0 },
    },
  });

  return new THREE.Points(geo, mat);
}

// ---------------------------------------------------------------------------
// GRID + AXES (faint instrument chart: gridlines + tick marks)
// Returns a Group sitting in the same objective-space plane as the field.
// ---------------------------------------------------------------------------
export function buildGrid() {
  const group = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x5eeaff,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x5eeaff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const lim = 1.15;
  const pts = [];
  const STEPS = 10;
  for (let k = 0; k <= STEPS; k++) {
    const t = -lim + (2 * lim * k) / STEPS;
    pts.push(-lim, t, -0.02, lim, t, -0.02); // horizontal
    pts.push(t, -lim, -0.02, t, lim, -0.02); // vertical
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(gGeo, gridMat));

  // bright axes at the edges (instrument frame)
  const axisPts = [
    -lim, -lim, -0.01, lim, -lim, -0.01, // x axis (bottom)
    -lim, -lim, -0.01, -lim, lim, -0.01, // y axis (left)
  ];
  // tick marks along the axes
  for (let k = 0; k <= STEPS; k++) {
    const t = -lim + (2 * lim * k) / STEPS;
    axisPts.push(t, -lim, -0.01, t, -lim - 0.04, -0.01); // x ticks
    axisPts.push(-lim, t, -0.01, -lim - 0.04, t, -0.01); // y ticks
  }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute("position", new THREE.Float32BufferAttribute(axisPts, 3));
  group.add(new THREE.LineSegments(aGeo, axisMat));

  return group;
}

// ---------------------------------------------------------------------------
// PARETO FRONT ARC (glowing green, pulsing) — built from non-dominated points
// ---------------------------------------------------------------------------
const PARETO_VERT = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PARETO_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  void main() {
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6);
    gl_FragColor = vec4(0.22, 0.95, 0.50, 0.85 * pulse); // pareto green
  }
`;

export function buildPareto(generation) {
  const front = paretoFront(generation).map((g) => genomeToParticle(g));
  if (front.length < 2) return null;

  // Catmull-Rom through the front for a smooth glowing arc. Rendered as a thin
  // TubeGeometry so the glow has width (line widths > 1 are ignored on most
  // platforms, which would make a 1px arc nearly invisible).
  const v = front.map((p) => new THREE.Vector3(p.x, p.y, 0.02));
  const curve = new THREE.CatmullRomCurve3(v, false, "catmullrom", 0.4);
  const geo = new THREE.TubeGeometry(curve, 120, 0.012, 8, false);

  const mat = new THREE.ShaderMaterial({
    vertexShader: PARETO_VERT,
    fragmentShader: PARETO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
  });
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// CHAMPION TOWER BEAM (vertical thermal-orange, pulsing) = MOON AI TOWER
//   M4 — uTime pulse is real GLSL, not a placeholder
//   H1 — returned as a Group so the caller can rotate it the SAME amount as
//        the field; the beam stays on the champion.
// ---------------------------------------------------------------------------
const TOWER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const TOWER_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float edge  = 1.0 - abs(vUv.x - 0.5) * 2.0;   // bright core, soft sides
    edge = pow(clamp(edge, 0.0, 1.0), 1.6);
    float pulse = 0.6 + 0.4 * sin(uTime * 2.0);
    float up    = smoothstep(0.0, 0.85, vUv.y);   // fade out toward the top
    float base  = smoothstep(0.0, 0.12, vUv.y);   // soft foot
    vec3 col = vec3(1.0, 0.42, 0.24);             // ~ #ff6a3d thermal
    gl_FragColor = vec4(col * edge * pulse, edge * up * base * 0.85);
  }
`;

export function buildTower(generation) {
  const group = new THREE.Group();
  const champ = championOf(generation);
  if (!champ) return group;
  const x = champ.obj[0] * 2 - 1;
  const y = champ.obj[1] * 2 - 1;

  const TOWER_H = 1.7;
  const geo = new THREE.PlaneGeometry(0.06, TOWER_H);
  const mat = new THREE.ShaderMaterial({
    vertexShader: TOWER_VERT,
    fragmentShader: TOWER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
  });
  const beam = new THREE.Mesh(geo, mat);
  // foot of the beam sits on the champion, rises upward (stays in frame)
  beam.position.set(x, y + TOWER_H / 2, 0.05);
  group.add(beam);

  // small bright beacon dot at the champion base
  const dotGeo = new THREE.PlaneGeometry(0.12, 0.12);
  const dotMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      precision mediump float; varying vec2 vUv; uniform float uTime;
      void main(){
        float d = length(vUv - 0.5);
        if (d > 0.5) discard;
        float pulse = 0.6 + 0.4 * sin(uTime * 2.0);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.35) * pulse, a * 0.9);
      }`,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.set(x, y, 0.06);
  group.add(dot);

  // expose pulse-driven materials for the loop
  group.userData.pulseMats = [mat, dotMat];
  return group;
}
