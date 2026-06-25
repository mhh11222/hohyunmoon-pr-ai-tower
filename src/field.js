import * as THREE from "three";
import { paretoFront, championOf } from "./ga.js";
import {
  fitnessAt,
  globalOptimum,
  objToWorld,
  sampleSurface,
} from "./landscape.js";

// ---------------------------------------------------------------------------
// 3D FITNESS LANDSCAPE
//   The hero is now a real surface z = f(x,y) (sum of gaussian peaks) that the
//   population climbs. The flat objective-space scatter became a filled,
//   height-colored surface with a faint wireframe; genomes are glowing dots
//   sitting ON the surface; the champion is a red/thermal × floating at the
//   global optimum with a thin beam rising to it.
//
//   World frame: objective (x,y) ∈ [0,1] → world (-1..1) via objToWorld; height
//   in +Z via fitnessAt * Z_SCALE. Everything below shares this frame so the
//   surface, particles, contour, axes and × marker register exactly.
// ---------------------------------------------------------------------------

export const Z_SCALE = 1.45; // world height of a fitness=1 peak
const PARTICLE_LIFT = 0.018; // hover dots just above the surface (anti-z-fight)

// per-genome satellites → a dense field, not a handful of dots
const SATELLITES_DESKTOP = 90;
const SATELLITES_MOBILE = 28;
const SAT_SPREAD = 0.05; // gaussian cluster radius in objective space (0..1)

const isMobile =
  typeof matchMedia === "function" &&
  matchMedia("(hover: none), (pointer: coarse)").matches;
const SATELLITES = isMobile ? SATELLITES_MOBILE : SATELLITES_DESKTOP;
const SURFACE_SUBDIV = isMobile ? 80 : 128;

// surface height in WORLD Z at an objective coordinate (shared everywhere)
function surfaceZ(ox, oy) {
  return fitnessAt(ox, oy) * Z_SCALE;
}

// ---------------------------------------------------------------------------
// HEIGHT-RAMP COLOR (custom palette, NOT viridis)
//   valleys  deep ink  #060A0F → aurora-dim #2a7d8c
//   mid      aurora    #5eeaff → pareto green #38f27f
//   peaks    thermal   #ff6a3d
//   Used both by the surface vertex colors (CPU) and conceptually mirrored in
//   the additive particle color. Pure JS so it's predictable + testable-ish.
// ---------------------------------------------------------------------------
const RAMP = [
  { t: 0.0, c: [0.04, 0.07, 0.1] }, // deep ink valley (just above #060A0F)
  { t: 0.22, c: [0.12, 0.36, 0.42] }, // toward aurora-dim #2a7d8c
  { t: 0.42, c: [0.2, 0.6, 0.68] }, // brighter dim-aurora slope
  { t: 0.6, c: [0.369, 0.918, 1.0] }, // #5eeaff aurora
  { t: 0.8, c: [0.22, 0.949, 0.498] }, // #38f27f pareto green
  { t: 1.0, c: [1.0, 0.416, 0.239] }, // #ff6a3d thermal peak
];

function rampColor(h, out) {
  const t = Math.min(1, Math.max(0, h));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i].t || i === RAMP.length - 1) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const f = (t - a.t) / (b.t - a.t || 1);
      out[0] = a.c[0] + (b.c[0] - a.c[0]) * f;
      out[1] = a.c[1] + (b.c[1] - a.c[1]) * f;
      out[2] = a.c[2] + (b.c[2] - a.c[2]) * f;
      return out;
    }
  }
  out[0] = out[1] = out[2] = 0;
  return out;
}

// ---------------------------------------------------------------------------
// SURFACE MESH — filled, vertex-colored by height + a faint wireframe overlay.
// Lambert-ish shading baked from a fixed key light so the peaks read as 3D
// even with additive everything else. Returns a Group { fill, wire }.
// ---------------------------------------------------------------------------
const SURF_VERT = /* glsl */ `
  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vNormal;
  attribute vec3 aColor;
  attribute float aHeight;
  void main() {
    vColor = aColor;
    vHeight = aHeight;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SURF_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vHeight;
  varying vec3 vNormal;
  uniform float uTime;
  uniform float uReveal; // 0..1 portal hand-off fade-in (1 = fully present)
  void main() {
    // directional key light from the upper-front so the 3D form reads even with
    // additive particles on top. Normals are in view space.
    vec3 N = normalize(vNormal);
    vec3 L = normalize(vec3(0.35, 0.55, 0.75));
    float diff = max(dot(N, L), 0.0);
    float rim = pow(1.0 - max(abs(N.z), 0.0), 2.0) * 0.35; // edge glow
    // ambient floor so valleys never go fully black-on-black (form stays read)
    float light = 0.42 + 0.72 * diff + rim;

    // faint contour banding so the surface reads like an instrument plot
    float band = 0.5 + 0.5 * sin(vHeight * 30.0);
    band = smoothstep(0.85, 1.0, band) * 0.12;

    // slow thermal shimmer on the high ground only
    float heat = smoothstep(0.62, 1.0, vHeight) * (0.5 + 0.5 * sin(uTime * 0.8));

    vec3 col = vColor * light + band + heat * vec3(0.22, 0.06, 0.0);
    gl_FragColor = vec4(col, uReveal);
  }
`;

export function buildSurface() {
  const group = new THREE.Group();
  const { positions, heights, indices } = sampleSurface({
    subdiv: SURFACE_SUBDIV,
    zScale: Z_SCALE,
  });

  const n = heights.length;
  const colors = new Float32Array(n * 3);
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    rampColor(heights[i], tmp);
    colors[i * 3] = tmp[0];
    colors[i * 3 + 1] = tmp[1];
    colors[i * 3 + 2] = tmp[2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aHeight", new THREE.BufferAttribute(heights, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();

  const fillMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT,
    fragmentShader: SURF_FRAG,
    uniforms: { uTime: { value: 0 }, uReveal: { value: 1 } },
    // transparent so the portal can fade the surface in on hand-off; with the
    // default uReveal=1 it renders fully opaque exactly as before.
    transparent: true,
    depthWrite: true,
  });
  const fill = new THREE.Mesh(geo, fillMat);
  group.add(fill);

  // faint wireframe overlay (aurora, subtractive-feeling low opacity)
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x5eeaff,
    wireframe: true,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
  });
  const wire = new THREE.Mesh(geo, wireMat);
  wire.position.z = 0.001;
  group.add(wire);

  group.userData.fillMat = fillMat;
  return group;
}

// ---------------------------------------------------------------------------
// POPULATION PARTICLES — glowing additive dots sitting ON the surface.
//   z = surfaceZ(genome.xy) + lift. Across the 16 generations they migrate
//   up-slope and converge near the × (morph playback preserved from P2).
// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uMouse;       // objective-space cursor (-1..1 world xy)
  uniform float uIntroT;      // 0..1 rush-in
  uniform float uPixelRatio;
  uniform float uScroll;
  uniform float uMorph;       // 0..1 generation transition (aFrom → position)

  attribute vec3  aStart;     // off-screen start pos for rush-in
  attribute vec3  aFrom;      // previous-generation position (morph start)
  attribute float aSize;
  attribute float aBright;
  attribute float aFromSize;
  attribute float aFromBright;
  attribute vec3  aSeed;

  varying float vBright;
  varying vec3  vCol;

  const vec3 AURORA = vec3(0.37, 0.92, 1.00); // #5eeaff
  const vec3 GREEN  = vec3(0.22, 0.95, 0.50); // #38f27f
  const vec3 THERMAL= vec3(1.00, 0.42, 0.24); // #ff6a3d

  void main() {
    vec3 genPos = mix(aFrom, position, uMorph);
    float size  = mix(aFromSize, aSize, uMorph);
    float bright= mix(aFromBright, aBright, uMorph);
    vec3 pos = mix(aStart, genPos, smoothstep(0.0, 1.0, uIntroT));

    float drift = uIntroT;
    // tiny tangential wander; keep it from sinking through the surface
    pos.x += sin(uTime * 0.25 + aSeed.x * 6.28) * 0.008 * drift;
    pos.y += cos(uTime * 0.21 + aSeed.y * 6.28) * 0.008 * drift;
    pos.z += sin(uTime * 0.9 + aSeed.z * 6.28) * 0.01 * drift;

    // cursor probe: gentle lift + brighten near the cursor
    vec2 d = pos.xy - uMouse;
    float probe = exp(-dot(d, d) * 6.0);
    pos.z += probe * 0.12 * drift;

    // height-driven color: low = aurora, mid = green, high = thermal champion
    float hz = clamp(genPos.z / 1.45, 0.0, 1.0);
    vec3 col = mix(AURORA, GREEN, smoothstep(0.15, 0.6, hz));
    col = mix(col, THERMAL, smoothstep(0.65, 1.0, hz));

    vCol = col;
    vBright = bright + probe * 0.6;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(size * uPixelRatio * (44.0 / -mv.z), 1.0, 60.0 * uPixelRatio);
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
    float a = smoothstep(0.5, 0.0, dist) * clamp(vBright, 0.04, 1.0);
    vec3 col = vCol + vec3(smoothstep(0.16, 0.0, dist) * 0.5);
    gl_FragColor = vec4(col, a);
  }
`;

// objective coords of a genome (0..1) — clamped so clusters stay on the field
function genomeObj(g) {
  return [Math.min(1, Math.max(0, g.obj[0])), Math.min(1, Math.max(0, g.obj[1]))];
}

export function buildField(generation) {
  const genomes = generation.genomes;
  const N = genomes.length * SATELLITES;

  const pos = new Float32Array(N * 3);
  const from = new Float32Array(N * 3);
  const start = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const bright = new Float32Array(N);
  const fromSize = new Float32Array(N);
  const fromBright = new Float32Array(N);
  const seed = new Float32Array(N * 3);

  // STABLE per-satellite objective-space offsets, generated once + reused every
  // generation so each genome's cloud morphs coherently (no reshuffle).
  const offX = new Float32Array(N);
  const offY = new Float32Array(N);
  const falloffArr = new Float32Array(N);

  function writeVertex(idx, ox, oy, target) {
    target[idx * 3] = objToWorld(ox);
    target[idx * 3 + 1] = objToWorld(oy);
    target[idx * 3 + 2] = surfaceZ(ox, oy) + PARTICLE_LIFT;
  }

  let i = 0;
  genomes.forEach((g, gi) => {
    const [box, boy] = genomeObj(g);
    for (let s = 0; s < SATELLITES; s++) {
      const rx = (Math.random() + Math.random() - 1) * SAT_SPREAD;
      const ry = (Math.random() + Math.random() - 1) * SAT_SPREAD;
      const r = Math.hypot(rx, ry) / SAT_SPREAD;
      const falloff = 1 - Math.min(1, r) * 0.65;
      offX[i] = rx;
      offY[i] = ry;
      falloffArr[i] = falloff;

      const ox = Math.min(1, Math.max(0, box + rx));
      const oy = Math.min(1, Math.max(0, boy + ry));
      writeVertex(i, ox, oy, pos);
      // first paint: morph-from == target
      from[i * 3] = pos[i * 3];
      from[i * 3 + 1] = pos[i * 3 + 1];
      from[i * 3 + 2] = pos[i * 3 + 2];

      // rush-in from below + outside the frame
      const ang = Math.random() * Math.PI * 2;
      const far = 3 + Math.random() * 2.5;
      start[i * 3] = pos[i * 3] + Math.cos(ang) * far;
      start[i * 3 + 1] = pos[i * 3 + 1] + Math.sin(ang) * far;
      start[i * 3 + 2] = pos[i * 3 + 2] - 5 - Math.random() * 3;

      const fit = g.fitness ?? 0;
      const sz = (1.5 + fit * 5.0) * falloff + 0.5;
      const br = Math.max(0.05, fit * (g.dominated ? 0.4 : 1.0) * falloff);
      size[i] = sz;
      bright[i] = br;
      fromSize[i] = sz;
      fromBright[i] = br;

      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
      i++;
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aFrom", new THREE.BufferAttribute(from, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  geo.setAttribute("aFromSize", new THREE.BufferAttribute(fromSize, 1));
  geo.setAttribute("aFromBright", new THREE.BufferAttribute(fromBright, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uIntroT: { value: 0 },
      uMorph: { value: 1 },
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      uScroll: { value: 0 },
    },
  });

  const points = new THREE.Points(geo, mat);

  // re-target the field to a NEW generation (morph 0→1 lerps the cloud up-slope)
  points.userData.retarget = function retarget(nextGen) {
    const gs = nextGen.genomes;
    from.set(pos);
    fromSize.set(size);
    fromBright.set(bright);

    let j = 0;
    gs.forEach((g) => {
      const [box, boy] = genomeObj(g);
      for (let s = 0; s < SATELLITES; s++) {
        const ox = Math.min(1, Math.max(0, box + offX[j]));
        const oy = Math.min(1, Math.max(0, boy + offY[j]));
        writeVertex(j, ox, oy, pos);
        const fo = falloffArr[j];
        const fit = g.fitness ?? 0;
        size[j] = (1.5 + fit * 5.0) * fo + 0.5;
        bright[j] = Math.max(0.05, fit * (g.dominated ? 0.4 : 1.0) * fo);
        j++;
      }
    });

    geo.attributes.position.needsUpdate = true;
    geo.attributes.aFrom.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aBright.needsUpdate = true;
    geo.attributes.aFromSize.needsUpdate = true;
    geo.attributes.aFromBright.needsUpdate = true;
    mat.uniforms.uMorph.value = 0;
  };

  return points;
}

// ---------------------------------------------------------------------------
// 3D AXIS FRAME — faint instrument cage with ticks. Floor grid + back walls +
// a Z (FITNESS↑) riser. Drawn in the same world frame as the surface.
// ---------------------------------------------------------------------------
export function buildAxes() {
  const group = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x5eeaff,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x5eeaff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });

  const lim = 1.0;
  const STEPS = 10;
  const floorZ = -0.02;

  // floor grid (z = floorZ)
  const grid = [];
  for (let k = 0; k <= STEPS; k++) {
    const t = -lim + (2 * lim * k) / STEPS;
    grid.push(-lim, t, floorZ, lim, t, floorZ);
    grid.push(t, -lim, floorZ, t, lim, floorZ);
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
  group.add(new THREE.LineSegments(gGeo, gridMat));

  // bright base square + Z risers at the corners (cage feel)
  const top = Z_SCALE * 1.05;
  const axis = [
    -lim, -lim, floorZ, lim, -lim, floorZ, // front edge (x)
    -lim, -lim, floorZ, -lim, lim, floorZ, // left edge (y)
    -lim, -lim, floorZ, -lim, -lim, top, // back-left Z riser (FITNESS↑)
    lim, -lim, floorZ, lim, -lim, top, // front-right Z riser
    -lim, lim, floorZ, -lim, lim, top, // back-left-far Z riser
  ];
  // ticks along x + y front edges
  for (let k = 0; k <= STEPS; k++) {
    const t = -lim + (2 * lim * k) / STEPS;
    axis.push(t, -lim, floorZ, t, -lim - 0.05, floorZ);
    axis.push(-lim, t, floorZ, -lim - 0.05, t, floorZ);
  }
  // ticks up the Z riser (fitness scale)
  for (let k = 0; k <= 6; k++) {
    const z = (top * k) / 6;
    axis.push(-lim, -lim, z, -lim - 0.05, -lim, z);
  }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute("position", new THREE.Float32BufferAttribute(axis, 3));
  group.add(new THREE.LineSegments(aGeo, axisMat));

  return group;
}

// ---------------------------------------------------------------------------
// PARETO RIDGE — the non-dominated set drawn as a glowing green contour that
// rides ON the surface (each vertex lifted to its surface height). Pulses.
// ---------------------------------------------------------------------------
const RIDGE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  void main() {
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6);
    gl_FragColor = vec4(0.22, 0.95, 0.50, 0.9 * pulse);
  }
`;
const RIDGE_VERT = /* glsl */ `
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function ridgeGeometry(generation) {
  const front = paretoFront(generation);
  if (front.length < 2) return null;
  const v = front.map((g) => {
    const [ox, oy] = genomeObj(g);
    return new THREE.Vector3(objToWorld(ox), objToWorld(oy), surfaceZ(ox, oy) + 0.03);
  });
  const curve = new THREE.CatmullRomCurve3(v, false, "catmullrom", 0.4);
  return new THREE.TubeGeometry(curve, 140, 0.014, 8, false);
}

export function buildPareto(generation) {
  const geo = ridgeGeometry(generation);
  if (!geo) return null;
  const mat = new THREE.ShaderMaterial({
    vertexShader: RIDGE_VERT,
    fragmentShader: RIDGE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
  });
  return new THREE.Mesh(geo, mat);
}

export function updatePareto(mesh, generation) {
  if (!mesh) return;
  const geo = ridgeGeometry(generation);
  if (!geo) return;
  const old = mesh.geometry;
  mesh.geometry = geo;
  if (old) old.dispose();
}

// ---------------------------------------------------------------------------
// GLOBAL OPTIMUM — red/thermal × marker floating above the tallest peak, with
// a thin beam rising to it. Replaces the old vertical tower; the champion home.
//   - the × sits at the global-optimum peak (fixed landscape feature)
//   - the beam rises from the surface up to the × at the CURRENT champion's
//     location, so the handoff beat still reads (beam relocates per generation)
// ---------------------------------------------------------------------------
const X_HALF = 0.07; // arm half-length of the ×
const X_LIFT = 0.34; // how high the × floats above the peak

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BEAM_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntro;   // 0..1 new-champion rush-in
  uniform float uExplode; // 0..1 old-champion blow-out
  void main() {
    float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
    edge = pow(clamp(edge, 0.0, 1.0), 1.6);
    float pulse = 0.6 + 0.4 * sin(uTime * 2.0);
    float up = smoothstep(1.0, 0.1, vUv.y);   // brightest at the foot, fades up
    float intro = smoothstep(0.0, 1.0, uIntro);
    float reveal = smoothstep(vUv.y, vUv.y + 0.25, intro);
    float flash = 1.0 + uExplode * 1.6;
    float life = (1.0 - uExplode) * reveal;
    vec3 col = vec3(1.0, 0.42, 0.24); // #ff6a3d
    gl_FragColor = vec4(col * edge * pulse * flash, edge * up * 0.7 * life);
  }
`;

// a flat × made of two crossed quads, always camera-facing-ish (billboard-lite:
// we keep it in world space but it's small enough to read from the iso angle).
function makeCrossMesh() {
  const g = new THREE.Group();
  const mkArm = (rot) => {
    const geo = new THREE.PlaneGeometry(X_HALF * 2, X_HALF * 0.34);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uIntro: { value: 1 }, uExplode: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        precision mediump float; varying vec2 vUv;
        uniform float uTime; uniform float uIntro; uniform float uExplode;
        void main(){
          float core = 1.0 - abs(vUv.y - 0.5) * 2.0;
          core = pow(clamp(core,0.0,1.0), 1.4);
          float pulse = 0.65 + 0.35 * sin(uTime * 2.4);
          float flash = 1.0 + uExplode * 2.0;
          float life = (1.0 - uExplode) * uIntro;
          gl_FragColor = vec4(vec3(1.0, 0.30, 0.18) * pulse * flash, core * 0.95 * life);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.z = rot;
    g.add(m);
    return mat;
  };
  const m1 = mkArm(Math.PI / 4);
  const m2 = mkArm(-Math.PI / 4);
  g.userData.mats = [m1, m2];
  return g;
}

export function buildTower(generation) {
  const group = new THREE.Group();

  // thin beam (a thermal plane) rising from the surface to the × height
  const beamGeo = new THREE.PlaneGeometry(0.05, 1.0);
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uIntro: { value: 1 }, uExplode: { value: 0 } },
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  group.add(beam);

  // the red × marker, parked at the global optimum
  const cross = makeCrossMesh();
  group.add(cross);

  group.userData.beam = beam;
  group.userData.cross = cross;
  const crossMats = cross.userData.mats;
  group.userData.handoffMats = [beamMat, ...crossMats];
  group.userData.pulseMats = [beamMat, ...crossMats];

  const champ = championOf(generation);
  group.userData.champId = champ ? champ.id : null;
  placeTower(group, champ);
  return group;
}

// place the beam foot at the CURRENT champion (on the surface) rising to the
// floating ×; the × itself parks at the GLOBAL optimum peak.
function placeTower(group, champ) {
  const opt = globalOptimum();
  const ox = objToWorld(opt.x);
  const oy = objToWorld(opt.y);
  const oz = opt.z * Z_SCALE; // world height of the global peak
  const xTop = oz + X_LIFT;

  // × marker floats above the global peak
  group.userData.cross.position.set(ox, oy, xTop);

  if (!champ) {
    group.userData.beam.visible = false;
    return;
  }
  group.userData.beam.visible = true;
  // beam rises from the champion's surface point up to the × height
  const cx = objToWorld(Math.min(1, Math.max(0, champ.obj[0])));
  const cy = objToWorld(Math.min(1, Math.max(0, champ.obj[1])));
  const cz = surfaceZ(champ.obj[0], champ.obj[1]);
  const beam = group.userData.beam;
  const h = Math.max(0.05, xTop - cz);
  beam.scale.y = h; // plane is unit-height; scale to span foot→×
  beam.position.set(cx, cy, cz + h / 2);
}

export function moveTower(group, generation) {
  const champ = championOf(generation);
  const prevId = group.userData.champId;
  const changed = champ && champ.id !== prevId;
  group.userData.champId = champ ? champ.id : null;
  group.userData.nextChamp = champ;
  return { changed, champ };
}

export function settleTower(group, champ) {
  placeTower(group, champ);
  group.userData.handoffMats.forEach((m) => {
    m.uniforms.uExplode.value = 0;
  });
}

// alias kept so main.js can read "buildAxes" while older callers used buildGrid
export { buildAxes as buildGrid };
