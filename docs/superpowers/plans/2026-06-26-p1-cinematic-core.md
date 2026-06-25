# MOON AI TOWER — P1 시네마틱 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** borealis.cool 풍 오로라 입자장 + 중앙 타워 비콘 + 스크롤 섹션 골격을 순수 Three.js 정적 사이트로 만들어 로컬 `index.html`에서 바로 보고 GitHub Pages에 배포 가능하게 한다.

**Architecture:** 단일 정적 페이지. 고정 풀뷰포트 WebGL 캔버스(`THREE.Points` + 커스텀 가산혼합 `ShaderMaterial`) 위로 DOM 섹션이 스크롤. 셰이더는 JS 템플릿 문자열로 인라인(file:// fetch CORS 회피). 순수 로직(`ga.js`: GA 데이터→입자 속성 매핑)만 vitest로 TDD, 렌더링은 빌드+육안 검증.

**Tech Stack:** Three.js r0.184(CDN importmap), 순수 HTML/CSS/ESM JS, vitest(Node 테스트), JetBrains Mono + Space Grotesk(셀프호스팅), GitHub Pages.

**전체 로드맵:** P1 시네마틱 코어(이 플랜) → P2 진짜 GA 데이터 애니메이션 → P3 탐험형 프로젝트 노드(GitHub API) → P4 입자 초상(얼굴)+연락 폭발 → P5 폴리시·성능·배포. 각 P는 별도 플랜.

설계 출처: `~/Desktop/moon-ai-tower/docs/DESIGN.md`. 팔레트 `#000`/시안 `#5eeaff`/오렌지 `#ff6a3d`/오프화이트 `#f4f3ee`.

---

### Task 0: 프로젝트 스캐폴드 + git + 테스트 러너

**Files:**
- Create: `~/Desktop/moon-ai-tower/index.html`
- Create: `~/Desktop/moon-ai-tower/package.json`
- Create: `~/Desktop/moon-ai-tower/.gitignore`
- Create: `~/Desktop/moon-ai-tower/styles/main.css`
- Create: `~/Desktop/moon-ai-tower/src/main.js` (빈 부트스트랩)

- [ ] **Step 1: 폴더·git 초기화**

```bash
cd ~/Desktop/moon-ai-tower
git init -q
mkdir -p src/shaders data styles tests
```

- [ ] **Step 2: `package.json` (테스트 러너만)**

```json
{
  "name": "moon-ai-tower",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "python3 -m http.server 8080"
  },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

- [ ] **Step 3: `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 4: `styles/main.css` (베이스)**

```css
:root{ --ink:#000; --bone:#f4f3ee; --aurora:#5eeaff; --thermal:#ff6a3d; }
*{margin:0;box-sizing:border-box}
html,body{height:100%;background:var(--ink);color:var(--bone);
  font-family:"JetBrains Mono",ui-monospace,monospace;overflow-x:hidden}
#bg{position:fixed;inset:0;z-index:0;display:block}
main{position:relative;z-index:1}
section{min-height:100vh;display:flex;align-items:center;padding:0 8vw}
```

- [ ] **Step 5: `index.html` (importmap + 캔버스 + 섹션 골격)**

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MOON AI TOWER — 문호현</title>
<link rel="stylesheet" href="./styles/main.css">
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.184.0/build/three.module.js"}}</script>
</head><body>
<canvas id="bg"></canvas>
<main>
  <section id="hero"><h1>MOON AI TOWER</h1></section>
  <section id="evolution"><p>진화 엔진</p></section>
  <section id="projects"><p>프로젝트</p></section>
  <section id="about"><p>About</p></section>
  <section id="contact"><p>연락</p></section>
</main>
<script type="module" src="./src/main.js"></script>
</body></html>
```

- [ ] **Step 6: `src/main.js` 빈 부트스트랩 (콘솔 확인용)**

```js
import * as THREE from "three";
console.log("MOON AI TOWER boot", THREE.REVISION);
```

- [ ] **Step 7: 설치 + 로컬 서버로 육안 확인**

Run: `cd ~/Desktop/moon-ai-tower && npm install && npm run dev`
Then open http://localhost:8080 — 검은 화면 + 콘솔에 `MOON AI TOWER boot 184`. (file://도 importmap 동작하나 dev 서버 권장.)
Expected: 콘솔에 `184`, 에러 없음.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold moon-ai-tower static three.js project"
```

---

### Task 1: GA 데이터 모델 + 합성 evo.json + 매핑 (TDD)

GA 한 세대를 입자 속성으로 바꾸는 순수 함수. 유일하게 단위테스트하는 부분.

**Files:**
- Create: `~/Desktop/moon-ai-tower/src/ga.js`
- Create: `~/Desktop/moon-ai-tower/tests/ga.test.js`
- Create: `~/Desktop/moon-ai-tower/data/evo.json`

- [ ] **Step 1: 실패 테스트 작성 `tests/ga.test.js`**

```js
import { describe, it, expect } from "vitest";
import { genomeToParticle, paretoFront, championOf } from "../src/ga.js";

const gen = {
  generation: 3,
  genomes: [
    { id: "a", obj: [0.2, 0.9], fitness: 0.55, dominated: false },
    { id: "b", obj: [0.8, 0.3], fitness: 0.40, dominated: false },
    { id: "c", obj: [0.5, 0.5], fitness: 0.95, dominated: false }, // champion
    { id: "d", obj: [0.1, 0.1], fitness: 0.10, dominated: true },
  ],
};

describe("genomeToParticle", () => {
  it("maps obj→xy in [-1,1], fitness→z/size/brightness", () => {
    const p = genomeToParticle(gen.genomes[0]);
    expect(p.x).toBeCloseTo(0.2 * 2 - 1);      // -0.6
    expect(p.y).toBeCloseTo(0.9 * 2 - 1);      // 0.8
    expect(p.size).toBeGreaterThan(0);
    expect(p.brightness).toBeCloseTo(0.55, 5); // fitness
  });
  it("dominated genome is dimmer than non-dominated of equal fitness", () => {
    const lit = genomeToParticle({ obj:[0,0], fitness:0.5, dominated:false });
    const dim = genomeToParticle({ obj:[0,0], fitness:0.5, dominated:true });
    expect(dim.brightness).toBeLessThan(lit.brightness);
  });
});

describe("paretoFront", () => {
  it("returns only non-dominated genomes, sorted by first objective", () => {
    const f = paretoFront(gen);
    expect(f.map(g => g.id)).toEqual(["a", "c", "b"]); // obj[0]: .2 .5 .8
    expect(f.every(g => !g.dominated)).toBe(true);
  });
});

describe("championOf", () => {
  it("returns the max-fitness genome", () => {
    expect(championOf(gen).id).toBe("c");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd ~/Desktop/moon-ai-tower && npx vitest run`
Expected: FAIL — `genomeToParticle is not a function` (모듈 미존재).

- [ ] **Step 3: 최소 구현 `src/ga.js`**

```js
// GA 데이터 → 입자 속성 (순수 함수). obj는 0~1 정규화 가정.
const DIM_PENALTY = 0.35; // dominated 밝기 감쇠

export function genomeToParticle(g) {
  const [o0, o1] = g.obj;
  return {
    x: o0 * 2 - 1,
    y: o1 * 2 - 1,
    z: (g.fitness ?? 0) * 1.5,            // 적합도 높을수록 카메라 쪽
    size: 6 + (g.fitness ?? 0) * 24,      // px point size 기준
    brightness: (g.fitness ?? 0) * (g.dominated ? DIM_PENALTY : 1),
  };
}

export function paretoFront(gen) {
  return gen.genomes
    .filter(g => !g.dominated)
    .sort((a, b) => a.obj[0] - b.obj[0]);
}

export function championOf(gen) {
  return gen.genomes.reduce((best, g) => (g.fitness > (best?.fitness ?? -1) ? g : best), null);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run`
Expected: PASS (3 files? no — 5 tests pass).

- [ ] **Step 5: 합성 `data/evo.json` (P1은 1세대만, P2에서 다세대)**

```json
{ "generations": [
  { "generation": 1, "genomes": [
    {"id":"g1","obj":[0.15,0.82],"fitness":0.51,"dominated":false},
    {"id":"g2","obj":[0.40,0.61],"fitness":0.78,"dominated":false},
    {"id":"g3","obj":[0.55,0.50],"fitness":0.96,"dominated":false},
    {"id":"g4","obj":[0.72,0.34],"fitness":0.64,"dominated":false},
    {"id":"g5","obj":[0.30,0.20],"fitness":0.22,"dominated":true},
    {"id":"g6","obj":[0.85,0.12],"fitness":0.18,"dominated":true}
  ]}
]}
```

- [ ] **Step 6: Commit**

```bash
git add src/ga.js tests/ga.test.js data/evo.json
git commit -m "feat(ga): genome→particle mapping + pareto/champion helpers (TDD)"
```

---

### Task 2: 입자장 지오메트리 + 셰이더 (빌드+육안)

**Files:**
- Create: `~/Desktop/moon-ai-tower/src/field.js`
- Modify: `~/Desktop/moon-ai-tower/src/main.js`

- [ ] **Step 1: `src/field.js` — Points + 인라인 셰이더**

```js
import * as THREE from "three";
import { genomeToParticle } from "./ga.js";

const VERT = /* glsl */`
uniform float uTime; uniform vec2 uMouse; uniform float uIntroT; uniform float uPixelRatio;
attribute vec3 aStart; attribute float aSize; attribute float aBright; attribute vec3 aSeed;
varying float vBright; varying vec3 vCol;
const vec3 BLUE=vec3(0.04,0.18,0.78), CYAN=vec3(0.72,1.0,1.0), GREEN=vec3(0.22,0.95,0.50);
void main(){
  vec3 pos = mix(aStart, position, smoothstep(0.0,1.0,uIntroT));
  float ang = uTime*0.06; mat2 R = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
  pos.xy = R*pos.xy;
  // 마우스 크레이터(평면상 거리)
  float r2 = dot(pos.xy-uMouse, pos.xy-uMouse);
  pos.z += exp(-r2*2.5)*0.25;
  // 오로라 컬러 = 싸인 노이즈
  float n1 = sin(pos.x*1.4+pos.y*0.7+uTime*0.95)*0.5+0.5;
  float n2 = sin(pos.y*1.1-pos.z*1.3+uTime*0.78+1.7)*0.5+0.5;
  float swirl = (n1+n2)*0.5 + (aSeed.x-0.5)*0.18;
  vec3 col = mix(BLUE, GREEN, swirl);
  col = mix(col, CYAN, (1.0-abs(swirl-0.5)*2.0)*0.45);
  vCol = col; vBright = aBright;
  vec4 mv = modelViewMatrix*vec4(pos,1.0);
  gl_PointSize = aSize*uPixelRatio*(300.0/-mv.z);
  gl_Position = projectionMatrix*mv;
}`;

const FRAG = /* glsl */`
precision mediump float; varying float vBright; varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
  float a = smoothstep(0.5,0.0,d)*clamp(vBright,0.05,1.0);
  vec3 col = vCol + vec3(smoothstep(0.18,0.0,d)*0.45); // 핫코어
  gl_FragColor = vec4(col, a);
}`;

export function buildField(generation) {
  const ps = generation.genomes.map(genomeToParticle);
  const N = ps.length;
  const pos = new Float32Array(N*3), start = new Float32Array(N*3);
  const size = new Float32Array(N), bright = new Float32Array(N), seed = new Float32Array(N*3);
  ps.forEach((p,i)=>{
    pos.set([p.x,p.y,p.z], i*3);
    start.set([p.x*6, p.y*6, p.z-8], i*3);     // 화면 밖에서 러시인
    size[i]=p.size; bright[i]=p.brightness;
    seed.set([Math.sin(i*12.9), Math.cos(i*7.7), (i%9)/9], i*3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos,3));
  g.setAttribute("aStart", new THREE.BufferAttribute(start,3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size,1));
  g.setAttribute("aBright", new THREE.BufferAttribute(bright,1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed,3));
  const mat = new THREE.ShaderMaterial({
    vertexShader:VERT, fragmentShader:FRAG, transparent:true,
    depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uTime:{value:0}, uMouse:{value:new THREE.Vector2()},
      uIntroT:{value:0}, uPixelRatio:{value:Math.min(devicePixelRatio,2)} },
  });
  return new THREE.Points(g, mat);
}
```

- [ ] **Step 2: `src/main.js` — 씬·카메라·필드 마운트 (정지 프레임)**

```js
import * as THREE from "three";
import { buildField } from "./field.js";

const canvas = document.getElementById("bg");
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 100);
camera.position.z = 4;
function resize(){ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

const evo = await fetch("./data/evo.json").then(r=>r.json());
const field = buildField(evo.generations[0]);
field.material.uniforms.uIntroT.value = 1; // P1: 정지 확인용, intro는 Task3
scene.add(field);
renderer.render(scene, camera);
```

- [ ] **Step 3: 육안 검증**

Run: `npm run dev` → http://localhost:8080
Expected: 검은 배경에 **시안~그린 오로라 빛 입자 6개**가 떠 있음(가산혼합 글로우). 콘솔 에러 없음. (적으면 Task에서 N 늘리는 건 P2.)

- [ ] **Step 4: Commit**

```bash
git add src/field.js src/main.js
git commit -m "feat(field): additive aurora particle field from GA generation"
```

---

### Task 3: 렌더 루프 + 인트로 러시인 + 마우스 크레이터

**Files:**
- Modify: `~/Desktop/moon-ai-tower/src/main.js`

- [ ] **Step 1: 루프·인트로·마우스 추가 (Task2의 `renderer.render` 한 줄을 교체)**

```js
const mouse = new THREE.Vector2(0,0);
addEventListener("pointermove", e=>{
  mouse.set((e.clientX/innerWidth)*2-1, -((e.clientY/innerHeight)*2-1));
});
field.material.uniforms.uIntroT.value = 0;     // 인트로 0에서 시작
const t0 = performance.now();
function loop(now){
  const t = (now - t0)/1000;
  const u = field.material.uniforms;
  u.uTime.value = t;
  u.uIntroT.value = Math.min(1, t/2.5);          // 2.5s 러시인
  u.uMouse.value.lerp(mouse, 0.08);              // 부드러운 추적
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

(주의: Task2 마지막의 `field.material.uniforms.uIntroT.value = 1;`와 `renderer.render(scene,camera);` 두 줄은 삭제.)

- [ ] **Step 2: 육안 검증**

Run: `npm run dev`
Expected: 입자들이 **화면 밖에서 날아들어와 2.5초에 형성**(러시인), 천천히 회전, 마우스 근처에서 살짝 솟음(크레이터). 60fps 부드러움.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(field): render loop + intro rush-in + mouse crater"
```

---

### Task 4: 스크롤 → uniform 구동 + 섹션 가독성

**Files:**
- Create: `~/Desktop/moon-ai-tower/src/scroll.js`
- Modify: `~/Desktop/moon-ai-tower/src/main.js`, `~/Desktop/moon-ai-tower/styles/main.css`

- [ ] **Step 1: `src/scroll.js` — 스크롤 진행률(0~1)**

```js
export function scrollProgress(){
  const max = document.body.scrollHeight - innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
```

- [ ] **Step 2: `main.js` 루프에 스크롤 회전 가속 주입**

`field.js`의 VERT에서 `float ang = uTime*0.06;`를 `float ang = uTime*0.06 + uScroll*6.2831;`로 바꾸고, 머티리얼 uniforms에 `uScroll:{value:0}` 추가. `main.js` import에 `import { scrollProgress } from "./scroll.js";`, 루프 안에 `u.uScroll.value = scrollProgress();`.

- [ ] **Step 3: CSS — 섹션 텍스트가 입자 위에서 읽히게**

`styles/main.css` 끝에 추가:

```css
h1{font-family:"Space Grotesk",sans-serif;font-size:clamp(2.5rem,9vw,7rem);
  letter-spacing:-.02em;mix-blend-mode:screen}
section p{font-size:clamp(1rem,2vw,1.4rem);color:var(--aurora);
  text-shadow:0 0 20px rgba(0,0,0,.9)}
section{background:linear-gradient(180deg,transparent,rgba(0,0,0,.5),transparent)}
```

- [ ] **Step 4: 육안 검증**

Run: `npm run dev`
Expected: 스크롤하면 **입자장이 추가로 회전**하고 섹션 텍스트(MOON AI TOWER 등)가 글로우 위에서 또렷이 읽힘. 5개 섹션 스크롤 됨.

- [ ] **Step 5: Commit**

```bash
git add src/scroll.js src/main.js src/field.js styles/main.css
git commit -m "feat: scroll-driven field rotation + readable sections"
```

---

### Task 5: 챔피언 타워 비콘 (MOON AI TOWER)

**Files:**
- Modify: `~/Desktop/moon-ai-tower/src/field.js`, `~/Desktop/moon-ai-tower/src/main.js`

- [ ] **Step 1: `field.js`에 비콘 빌더 추가 (export)**

```js
export function buildBeacon(generation){
  // 챔피언 좌표에 수직 타워 빔(가산혼합 평면)
  const champ = generation.genomes.reduce((b,g)=>g.fitness>(b?.fitness??-1)?g:b,null);
  const x = champ.obj[0]*2-1, y = champ.obj[1]*2-1;
  const geo = new THREE.PlaneGeometry(0.06, 3.0);
  const mat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uTime:{value:0} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`precision mediump float; varying vec2 vUv; uniform float uTime;
      void main(){ float edge=1.0-abs(vUv.x-0.5)*2.0; float pulse=0.6+0.4*sin(uTime*2.0);
        float up=smoothstep(0.0,1.0,vUv.y);
        gl_FragColor=vec4(vec3(0.36,0.92,1.0)*edge*pulse, edge*up*0.7);}`,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(x, y+1.4, 0.2);
  return beam;
}
```

- [ ] **Step 2: `main.js`에서 비콘 추가 + 루프에서 uTime 갱신**

```js
import { buildField, buildBeacon } from "./field.js";
const beacon = buildBeacon(evo.generations[0]);
scene.add(beacon);
// loop 안에: beacon.material.uniforms.uTime.value = t;
```

- [ ] **Step 3: 육안 검증**

Run: `npm run dev`
Expected: 챔피언 입자 위로 **맥동하는 시안 수직 빔(타워)**. 이게 MOON AI TOWER의 시각 앵커.

- [ ] **Step 4: Commit**

```bash
git add src/field.js src/main.js
git commit -m "feat: champion tower beacon (MOON AI TOWER anchor)"
```

---

### Task 6: 폰트 셀프호스팅 + GitHub Pages 준비

**Files:**
- Create: `~/Desktop/moon-ai-tower/fonts/` (JetBrains Mono, Space Grotesk woff2)
- Modify: `~/Desktop/moon-ai-tower/styles/main.css`, `~/Desktop/moon-ai-tower/index.html`
- Create: `~/Desktop/moon-ai-tower/.nojekyll`

- [ ] **Step 1: 폰트 내려받기(라이선스 안전: 둘 다 OFL)**

```bash
cd ~/Desktop/moon-ai-tower/fonts
curl -L -o JetBrainsMono.woff2 "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.woff2"
curl -L -o SpaceGrotesk.woff2 "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-500-normal.woff2"
ls -la
```

Expected: 두 woff2 파일 존재(>0 bytes). 실패 시 fontsource 페이지에서 정확한 URL 확인.

- [ ] **Step 2: `styles/main.css` 상단에 @font-face**

```css
@font-face{font-family:"JetBrains Mono";src:url("../fonts/JetBrainsMono.woff2") format("woff2");font-display:swap}
@font-face{font-family:"Space Grotesk";src:url("../fonts/SpaceGrotesk.woff2") format("woff2");font-display:swap}
```

- [ ] **Step 3: GitHub Pages용 `.nojekyll`**

```bash
touch ~/Desktop/moon-ai-tower/.nojekyll
```

- [ ] **Step 4: 전체 테스트 + 육안 최종**

Run: `cd ~/Desktop/moon-ai-tower && npx vitest run && npm run dev`
Expected: vitest 5 통과, 사이트가 셀프호스팅 폰트로 렌더(네트워크 끊어도 폰트 정상).

- [ ] **Step 5: Commit + 첫 푸시(원격은 P5/배포 시)**

```bash
git add -A && git commit -m "chore: self-host OFL fonts + github pages prep"
```

---

## Self-Review

**Spec coverage (DESIGN.md P1 = 시네마틱 코어):** 입자장(Task2) ✅ · 타워 비콘(Task5) ✅ · 스크롤 섹션 골격(Task1 index + Task4) ✅ · 정적·GitHub Pages(Task0,6) ✅ · GA 데이터→입자 매핑(Task1, TDD) ✅ · 인트로/마우스(Task3) ✅. 다세대 애니메이션·파레토 전선 시각화는 **P2**(범위 밖, 의도적). 프로젝트 노드=P3, 얼굴=P4.

**Placeholder scan:** 모든 스텝에 실제 코드·명령·기대출력 포함. TBD 없음.

**Type consistency:** `genomeToParticle`가 반환하는 `{x,y,z,size,brightness}`를 `field.js`가 그대로 소비. `championOf`/비콘의 챔피언 산출 로직 동일(max fitness). uniforms 이름(`uTime/uMouse/uIntroT/uScroll/uPixelRatio`) Task2→3→4에서 일관.

**주의:** Task3에서 Task2의 정지-렌더 2줄을 삭제하도록 명시. Task4에서 `field.js` VERT의 `ang` 식·uniforms 동시 수정 명시.

---

## /autoplan 리뷰 (CEO·Design·Eng, subagent-only / codex 미설치)

### Cross-Phase 테마 (2+ 렌즈 독립 수렴 = 고신뢰)
1. **"예쁘지만 텅 빔 / 빌드 순서 역전" — CEO+Design.** P1이 스펙터클만 출시하고 실제 콘텐츠(이름·태그라인·실제 프로젝트·About·연락처)가 0. 첫 배포 URL이 방문자에게 "이 사람 누구·뭐 했나·어떻게 연락"에 답을 못 함 = 포트폴리오의 유일한 임무 실패. + GA 데이터가 합성이라 "내 진짜 엔진"이라는 차별점이 P1엔 안 보임(엔지니어는 가짜로 읽음). → **콘텐츠 먼저, 스펙터클은 장식. CSS-first로 JS 꺼져도 완전.**
2. **접근성/우아한 저하 = P5 아니라 P1 차단요소 — Design(CRIT)+CEO(F4)+Eng(C1).** reduced-motion 없음(전정장애 유발), WebGL 실패 폴백 없음(잠긴 회사 노트북/약한 GPU=흑화면), 캔버스 a11y·키보드 포커스·실제 연락 링크 없음. → P1로 이동.

### Eng 자동수정(반영): M3 uScroll 선언 / C1·C2 데이터 ESM 인라인+에러핸들 / H1 회전 Object3D로 / H2 PointSize 클램프 / H3 입자 밀도 / M2 DPR리사이즈 / M4 비콘 uTime 코드화 / M7 mix-blend 제거 / M8 폰트 버전 핀.

### USER CHALLENGE (자동결정 금지 — 사용자 방향 변경 제안)
유저 선택 = C("사이트가 곧 GA", 스펙터클 먼저, 콘텐츠는 P2~P5). 두 리뷰 = 역전(콘텐츠+a11y 먼저). 사용자 직접 결정. 기본값 = 유저 원안.

| # | Phase | Decision | Class | 원칙 | Rationale |
|---|---|---|---|---|---|
| 1 | Eng | 코드 버그 9건 플랜 반영 | Mechanical | P5,P1 | M3는 확정 흑화면; 나머지 렌더 정합 |
| 2 | CEO+Design | P1에 실콘텐츠+a11y+CSS-first 포함(빌드순서 역전) | User Challenge→gate | P1 | 포트폴리오는 첫 배포가 유용해야 |

### 게이트 결정: **B (원안 유지)** — APPROVED
유저가 USER CHALLENGE(#2)를 거부하고 원안 C(스펙터클 먼저) 유지. 콘텐츠·a11y·reduced-motion·WebGL폴백 = P2~P5로 명시 이연(유저 결정, 기본값). Eng 코드 버그 9건(M3/C1/C2/H1/H2/H3/M2/M4/M7/M8)은 버그라 P1에 반영. STATUS: APPROVED, 빌드 진행 가능.
