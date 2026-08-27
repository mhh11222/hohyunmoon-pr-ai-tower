// 3D 테이블 — three.js. 규칙은 하나도 모르고, "이런 모션을 보여 달라"는 주문만 받는다.
//
// 좌표: 카메라는 +z 쪽(내 자리)에서 테이블을 내려다본다. y가 위쪽.
// 자리 배치는 회전으로 푼다: 내 자리(side 0)를 기준 틀로 두고,
// side s는 기준 좌표를 s × (360°/인원수) 만큼 돌려서 앉힌다.
//   4인: 아래(나)·오른쪽·위·왼쪽  /  3인: 아래·오른위·왼위  /  2인: 아래·위
// 패는 눕힌 상자. 윗면(+Y)이 얼굴, 아랫면이 대나무 등판이다.

import { Timeline, tween, lerp, arc, easeOutCubic, easeInOutQuad, linear as linearEase } from "./anim.js";
import { faceCanvas, diceCanvas } from "./tiletexture.js";

const TILE = { w: 0.068, h: 0.095, d: 0.046 };
const TABLE = { w: 2.4, d: 2.4 };

// 기준 틀(내 자리, 아래쪽)에서의 거리들
const BASE = { hand: 0.8, wall: 0.58, meld: 0.38, river: 0.13, sticks: [0.9, 0.56] };

/**
 * 벽마다 벽돌(2장 기둥) 몇 개인지 — 엔진 buildWalls와 같은 고른 분배.
 * 2인 100장 → 25/25, 4인 140장 → 18/18/17/17.
 */
export function wallCounts(total, walls) {
  const counts = [];
  let left = total / 2;
  for (let w = 0; w < walls; w++) {
    const size = Math.ceil(left / (walls - w));
    counts.push(size);
    left -= size;
  }
  return counts;
}

/**
 * 뽑기 순서 → 물리적 자리. 엔진 drawOrderFrom과 같은 순서다:
 * 입구 벽돌부터 (위 칸 → 아래 칸), 벽을 돌아, 입구 앞에 건너뛴 벽돌들이 맨 뒤.
 * 그래서 산은 인원수대로 고르게 서 있고, 소비는 입구에서 시작해 담을 따라 돈다.
 */
export function computeWallSequence(total, walls, opening = { wallIndex: 0, stackIndex: 0 }) {
  const counts = wallCounts(total, walls);
  const seq = [];
  const pushStack = (wall, stack) => {
    seq.push({ wall, stack, tier: 1 });
    seq.push({ wall, stack, tier: 0 });
  };
  for (let k = opening.stackIndex; k < counts[opening.wallIndex]; k++) pushStack(opening.wallIndex, k);
  for (let w = 1; w < walls; w++) {
    const wall = (opening.wallIndex + w) % walls;
    for (let k = 0; k < counts[wall]; k++) pushStack(wall, k);
  }
  for (let k = 0; k < opening.stackIndex; k++) pushStack(opening.wallIndex, k);
  return { counts, seq };
}

/** 그 눈이 위를 보게 하는 회전 (면 배치 [3,4,1,6,2,5] 기준) */
const UP_ROTATION = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

export async function createTable(canvas, { sound = null } = {}) {
  let THREE;
  try {
    THREE = await import("three");
  } catch {
    return null; // three를 못 불러오면 2D로 간다
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null; // WebGL 없음
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 40);
  const lookTarget = new THREE.Vector3(0, 0, -0.08);

  /** 의식용 — 산 쌓기가 한눈에 보이는 위에서 본 앵글 */
  function ceremonyView(count) {
    return count >= 3
      ? { pos: new THREE.Vector3(0, 2.0, 1.3), look: new THREE.Vector3(0, 0, -0.08) }
      : { pos: new THREE.Vector3(0, 1.82, 1.18), look: new THREE.Vector3(0, 0, -0.08) };
  }

  /** 본게임용 — 상대 얼굴을 보며 치는, 적당히 위에서 내려다보는 앵글 */
  function playView(count) {
    return count >= 3
      ? { pos: new THREE.Vector3(0, 1.18, 1.92), look: new THREE.Vector3(0, 0.08, -0.3) }
      : { pos: new THREE.Vector3(0, 1.06, 1.78), look: new THREE.Vector3(0, 0.08, -0.32) };
  }

  function setCam(view) {
    camera.position.copy(view.pos);
    lookTarget.copy(view.look);
    camera.lookAt(lookTarget);
  }

  /** 카메라가 스르륵 내려간다 */
  function glideCam(view, duration = 2.4) {
    const fromPos = camera.position.clone();
    const fromLook = lookTarget.clone();
    timeline.add(tween({
      duration,
      ease: easeInOutQuad,
      onUpdate: (t) => {
        camera.position.lerpVectors(fromPos, view.pos, t);
        lookTarget.lerpVectors(fromLook, view.look, t);
        camera.lookAt(lookTarget);
      },
    }));
    return settle();
  }

  setCam(ceremonyView(2));

  scene.add(new THREE.HemisphereLight(0xf2ead9, 0x2e2620, 0.95));
  const key = new THREE.DirectionalLight(0xfff6e0, 1.35);
  key.position.set(-1.1, 2.7, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.7;
  key.shadow.camera.right = 1.7;
  key.shadow.camera.top = 1.7;
  key.shadow.camera.bottom = -1.7;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 6;
  key.shadow.bias = -0.0015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd6b4, 0.35);
  rim.position.set(1.6, 1.2, -1.8);
  scene.add(rim);

  // 배경 — 따뜻한 가정집을 아주 작게 그려 크게 늘리면 블러가 된다
  function homeBackdrop() {
    const small = document.createElement("canvas");
    small.width = 48;
    small.height = 72;
    const c = small.getContext("2d");

    // 벽 — 따뜻한 크림색, 아래로 갈수록 어둡게
    const wallGrad = c.createLinearGradient(0, 0, 0, 72);
    wallGrad.addColorStop(0, "#c9bba4");
    wallGrad.addColorStop(0.55, "#a8987f");
    wallGrad.addColorStop(1, "#6f6250");
    c.fillStyle = wallGrad;
    c.fillRect(0, 0, 48, 72);

    // 왼쪽 창문 — 낮빛
    const win = c.createRadialGradient(10, 18, 2, 10, 18, 16);
    win.addColorStop(0, "rgba(255,248,224,.95)");
    win.addColorStop(1, "rgba(255,248,224,0)");
    c.fillStyle = win;
    c.fillRect(0, 0, 26, 40);
    c.fillStyle = "rgba(236,225,196,.8)";
    c.fillRect(5, 9, 11, 17);

    // 오른쪽 스탠드 — 노란 전등
    const lamp = c.createRadialGradient(39, 22, 1, 39, 22, 12);
    lamp.addColorStop(0, "rgba(255,208,130,.95)");
    lamp.addColorStop(1, "rgba(255,208,130,0)");
    c.fillStyle = lamp;
    c.fillRect(27, 8, 21, 30);

    // 가구 실루엣
    c.fillStyle = "rgba(84,66,50,.55)";
    c.fillRect(0, 34, 14, 14);
    c.fillRect(33, 33, 15, 15);

    // 마루 바닥
    const floor = c.createLinearGradient(0, 46, 0, 72);
    floor.addColorStop(0, "#7d5f43");
    floor.addColorStop(1, "#4a3826");
    c.fillStyle = floor;
    c.fillRect(0, 46, 48, 26);

    const big = document.createElement("canvas");
    big.width = 512;
    big.height = 768;
    const bc = big.getContext("2d");
    bc.imageSmoothingEnabled = true;
    bc.imageSmoothingQuality = "high";
    bc.drawImage(small, 0, 0, 512, 768); // 확대 = 자연 블러

    const tex = new THREE.CanvasTexture(big);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  scene.background = homeBackdrop();

  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.w, TABLE.d),
    new THREE.MeshStandardMaterial({ color: 0x14523c, roughness: 0.95, metalness: 0 })
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  scene.add(felt);

  const rimMesh = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.w + 0.16, 0.07, TABLE.d + 0.16),
    new THREE.MeshStandardMaterial({ color: 0x0c3627, roughness: 0.6 })
  );
  rimMesh.position.y = -0.05;
  scene.add(rimMesh);

  /* ── 자리 회전 ────────────────────────────────────── */

  let sideCount = 2; // newHand에서 인원수로 바뀐다

  function sideAngle(side) {
    return (side * Math.PI * 2) / sideCount;
  }

  /** 기준 틀 좌표 → side 자리로 회전 */
  function orient(x, y, z, side) {
    const a = sideAngle(side);
    return new THREE.Vector3(
      x * Math.cos(a) + z * Math.sin(a),
      y,
      -x * Math.sin(a) + z * Math.cos(a)
    );
  }

  /* ── 재료 ─────────────────────────────────────────── */

  const textures = new Map();
  function faceTexture(id) {
    if (!textures.has(id)) {
      const tex = new THREE.CanvasTexture(faceCanvas(id, 128));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      textures.set(id, tex);
    }
    return textures.get(id);
  }

  const sideMat = new THREE.MeshStandardMaterial({ color: 0xefe8d6, roughness: 0.55 });
  // 패마다 옆면 상아색이 조금씩 달라 낱장으로 읽힌다
  const sideShades = [0xf2ecdb, 0xe9e0cb, 0xefe6d2, 0xe4d9c0].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })
  );
  const sideShadesLow = [0xd9cfb4, 0xd2c6a9].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })
  );
  const backMat = new THREE.MeshStandardMaterial({ color: 0xc99e5f, roughness: 0.55 }); // 대나무 등판
  const backMatLow = new THREE.MeshStandardMaterial({ color: 0x8f6c3a, roughness: 0.6 }); // 아래 칸 — 그늘진 대나무
  const tileGeo = new THREE.BoxGeometry(TILE.w, TILE.d, TILE.h);
  const pool = [];

  function makeTile(id) {
    const mesh = pool.pop() || new THREE.Mesh(tileGeo, [sideMat, sideMat, sideMat, sideMat, sideMat, sideMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.material = [
      sideMat, sideMat,
      id ? new THREE.MeshStandardMaterial({ map: faceTexture(id), roughness: 0.45 }) : backMat,
      backMat, sideMat, sideMat,
    ];
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    mesh.rotation.set(0, 0, 0);
    scene.add(mesh);
    return mesh;
  }

  function recycle(mesh) {
    scene.remove(mesh);
    pool.push(mesh);
  }

  /* ── 손 — 실제 게임처럼 손이 패를 집고 놓는다 ─────────── */

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe9bb92, roughness: 0.75 });
  const pawMat = new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 0.85 });

  /** 스타일라이즈한 손. 내 쪽은 사람 손, 상대 쪽은 고양이 앞발. */
  function buildHand(isPaw) {
    const group = new THREE.Group();
    const mat = isPaw ? pawMat : skinMat;
    if (isPaw) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), mat);
      paw.scale.set(1, 0.62, 1.15);
      group.add(paw);
      for (let i = -1; i <= 1; i++) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mat);
        toe.position.set(i * 0.038, -0.008, -0.062);
        group.add(toe);
      }
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 10), mat);
      leg.rotation.x = Math.PI / 2.2;
      leg.position.set(0, 0.06, 0.14);
      group.add(leg);
      group.scale.setScalar(0.85);
    } else {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.032, 0.12), mat);
      group.add(palm);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.07, 3, 6), mat);
        finger.rotation.x = Math.PI / 2 - 0.5;
        finger.position.set(-0.054 + i * 0.036, -0.012, -0.085);
        group.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 3, 6), mat);
      thumb.rotation.z = Math.PI / 2.6;
      thumb.rotation.x = -0.4;
      thumb.position.set(0.085, -0.01, -0.02);
      group.add(thumb);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.16, 10), mat);
      wrist.rotation.x = Math.PI / 2.15;
      wrist.position.set(0, 0.015, 0.13);
      group.add(wrist);
      group.scale.setScalar(0.8);
    }
    group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    group.visible = false;
    scene.add(group);
    return group;
  }

  let hands3d = []; // side마다 하나 — newHand에서 만든다
  let cats3d = [];  // 자리에 앉은 고양이들 — 각자 다른 잔모션으로 움직인다

  /**
   * 저폴리 고양이 — 실물 무늬대로.
   *   포도: 제일 작음. 삼색(어두운 바탕 + 주황 얼룩), 얼굴은 아수라백작 —
   *         왼쪽 뺨 주황 / 오른쪽 어두움, 귀도 짝짝이. 늘 졸린 실눈.
   *   감자: 보통 몸집. 새하얀 바탕에 회색 귀와 정수리 얼룩.
   *   막내: 개뚱뚱. 흰 바탕에 회색 귀·머리·등 얼룩.
   */
  function buildCat(kind) {
    const spec = {
      podo: { base: 0x3a2e27, scale: 1.15, fat: 1 },
      gamja: { base: 0xf4f0e8, scale: 1.4, fat: 1 },
      maknae: { base: 0xf4f0e8, scale: 1.75, fat: 1.3 },
    }[kind] || { base: 0xcccccc, scale: 1.2, fat: 1 };

    const ORANGE = 0xb5763f;
    const GREY = 0x8d9096;
    const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const bodyMat = mat(spec.base);
    const dark = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.4 });

    const cat = new THREE.Group();

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), bodyMat);
    body.scale.set(1 * spec.fat, 0.85, 1.12 * spec.fat);
    body.position.y = 0.13;
    cat.add(body);

    // 몸 얼룩
    const bodyPatch = (color, x, y, z, r = 0.06) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color));
      m.scale.set(1.2, 0.7, 1.2);
      m.position.set(x, y, z);
      cat.add(m);
    };
    if (kind === "podo") {
      bodyPatch(ORANGE, 0.09 * spec.fat, 0.2, 0.04, 0.055);   // 삼색 얼룩
      bodyPatch(ORANGE, -0.07 * spec.fat, 0.11, -0.1, 0.05);
      bodyPatch(0x241c17, 0.02, 0.23, -0.06, 0.06);
    }
    if (kind === "maknae") {
      bodyPatch(GREY, -0.06 * spec.fat, 0.24, -0.05, 0.065);  // 등의 회색 얼룩
    }

    for (const dx of [-0.07 * spec.fat, 0.07 * spec.fat]) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), mat(kind === "podo" ? 0xe8dcc8 : 0xf4f0e8));
      paw.position.set(dx, 0.035, 0.13 * spec.fat);
      cat.add(paw);
    }

    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.14, 3, 8),
      mat(kind === "podo" ? 0x2e2420 : kind === "maknae" ? GREY : 0xf4f0e8));
    tail.rotation.x = Math.PI / 2.6;
    tail.rotation.z = 0.7;
    tail.position.set(0.13 * spec.fat, 0.1, -0.13 * spec.fat);
    cat.add(tail);

    // 머리 — 따로 묶어 고개짓을 시킨다
    const head = new THREE.Group();
    head.position.set(0, 0.3, 0.06);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), bodyMat);
    skull.scale.set(1.05, 0.95, 0.95);
    head.add(skull);

    if (kind === "podo") {
      // 아수라백작 — 왼쪽 반쪽이 주황
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.104, 14, 12), mat(ORANGE));
      half.scale.set(0.55, 0.96, 0.96);
      half.position.set(-0.052, 0, 0.004);
      head.add(half);
    }
    if (kind === "gamja") {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(GREY));
      crown.scale.set(1.25, 0.6, 1);
      crown.position.set(-0.035, 0.075, 0);
      head.add(crown);
    }
    if (kind === "maknae") {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), mat(GREY));
      crown.scale.set(1.3, 0.65, 1.05);
      crown.position.set(0.04, 0.07, 0.01);
      head.add(crown);
    }

    const earColor = {
      podo: [0xb5763f, 0x2e2420],        // 왼쪽 주황 / 오른쪽 어두움 — 짝짝이
      gamja: [GREY, GREY],
      maknae: [GREY, GREY],
    }[kind] || [0xbbbbbb, 0xbbbbbb];
    [-0.058, 0.058].forEach((dx, i) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.065, 8), mat(earColor[i]));
      ear.position.set(dx, 0.1, -0.01);
      ear.rotation.z = dx > 0 ? -0.25 : 0.25;
      head.add(ear);
    });

    const eyes = [];
    for (const dx of [-0.042, 0.042]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), dark);
      eye.position.set(dx, 0.01, 0.093);
      if (kind === "podo") { eye.scale.y = 0.55; eye.scale.x = 1.3; } // 늘 졸린 실눈
      head.add(eye);
      eyes.push(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8),
      mat(kind === "podo" ? 0x7c463a : 0xd88f8f));
    nose.position.set(0, -0.03, 0.1);
    head.add(nose);
    cat.add(head);

    cat.scale.setScalar(spec.scale);
    cat.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(cat);
    return { group: cat, head, tail, eyes, kind, seed: Math.random() * 10, dist: 1.1 + spec.scale * 0.07 };
  }

  /**
   * 각자 성격대로 움직인다 (매 프레임).
   *   포도: 졸려서 꾸벅꾸벅 + 계속 뒤뚱뒤뚱
   *   감자: 시크 — 거의 안 움직이고 숨쉬기·꼬리만 살랑, 가끔 느린 깜빡임
   *   막내: 바보 — 고개만 자꾸 좌우로 이리저리
   */
  function animateCats(now) {
    const t = now / 1000;
    for (const cat of cats3d) {
      const k = t + cat.seed;
      if (cat.kind === "podo") {
        cat.group.rotation.z = Math.sin(k * 2.1) * 0.09;             // 뒤뚱뒤뚱
        cat.group.position.y = Math.abs(Math.sin(k * 2.1)) * 0.008;
        const doze = Math.max(0, Math.sin(k * 0.45));                 // 이따금 꾸벅
        cat.head.rotation.x = 0.02 + doze * 0.18;
        cat.head.rotation.z = Math.sin(k * 2.1) * 0.06;
      } else if (cat.kind === "gamja") {
        cat.group.scale.y = cat.group.scale.x * (1 + Math.sin(k * 1.1) * 0.012); // 숨만 쉰다
        cat.tail.rotation.z = 0.7 + Math.sin(k * 0.8) * 0.25;                    // 꼬리만 살랑
        const blink = (k % 4.7) < 0.18 ? 0.15 : 1;                               // 가끔 천천히 깜빡
        for (const eye of cat.eyes) eye.scale.y = blink;
        cat.head.rotation.y = Math.sin(k * 0.13) * 0.08;                          // 아주 가끔 시선만
      } else if (cat.kind === "maknae") {
        cat.head.rotation.y = Math.sin(k * 1.4) * 0.55 + Math.sin(k * 3.1) * 0.18; // 두리번두리번
        cat.head.rotation.x = 0.05 + Math.sin(k * 2.3) * 0.06;
        cat.group.rotation.z = Math.sin(k * 1.4 + 1) * 0.03;
      }
    }
  }

  /** 인원·배정대로 고양이들을 자리에 앉힌다 */
  function seatCats3d(catsBySeat) {
    for (const cat of cats3d) scene.remove(cat.group);
    cats3d = [];
    if (!catsBySeat) return;
    catsBySeat.forEach((info, seat) => {
      if (!info) return;
      const side = seatSide(seat);
      const cat = buildCat(info.key);
      cat.group.position.copy(orient(0, 0, cat.dist, side));
      cat.group.rotation.y = sideAngle(side) + Math.PI; // 테이블 중앙을 본다
      cats3d.push(cat);
    });
  }

  function handRest(side) {
    return orient(0.3, 0.42, 1.5, side);
  }

  /**
   * side의 손이 나타나 mesh를 집어 to에 놓고 물러난다.
   * mesh가 null이면 빈손 동작.
   */
  function handCarry(side, mesh, to, { duration = 0.55, height = 0.14, grabAt = null, onDone = null } = {}) {
    const hand = hands3d[side];
    if (!hand) { if (mesh) mesh.position.copy(to); onDone?.(); return; }
    const rest = handRest(side);
    const lift = 0.058;
    const from = grabAt ? grabAt.clone() : (mesh ? mesh.position.clone() : to.clone());
    const reach = duration * 0.45;
    const carry = duration * 0.55;
    hand.visible = true;
    hand.position.copy(rest);
    hand.rotation.y = sideAngle(side) + (side === 0 ? 0 : Math.PI);

    timeline.add(tween({
      duration: reach, ease: easeOutCubic,
      onUpdate: (t) => {
        hand.position.lerpVectors(rest, new THREE.Vector3(from.x, from.y + lift, from.z), t);
      },
    }));
    timeline.add(tween({
      duration: carry, delay: reach, ease: easeInOutQuad,
      onUpdate: (t) => {
        const x = lerp(from.x, to.x, t);
        const z = lerp(from.z, to.z, t);
        const y = lerp(from.y, to.y, t) + arc(t, height);
        hand.position.set(x, y + lift, z);
        if (mesh) mesh.position.set(x, y, z);
      },
      onDone: () => {
        if (mesh) mesh.position.copy(to);
        sound?.sfx?.clack?.(0, { gain: 0.7 });
      },
    }));
    timeline.add(tween({
      duration: 0.32, delay: reach + carry, ease: easeOutCubic,
      onUpdate: (t) => {
        hand.position.lerpVectors(new THREE.Vector3(to.x, to.y + lift, to.z), rest, t);
      },
      onDone: () => { hand.visible = false; onDone?.(); },
    }));
  }

  /* ── 상태 ─────────────────────────────────────────── */

  const timeline = new Timeline();
  let speed = 1; // 1 = 실전. 학습 모드는 1.6~2로 늦춰 전 과정을 눈으로 따라가게 한다.

  /** 아무것도 안 하고 잠깐 쉰다 (speed의 영향을 받는다) */
  function pause(seconds) {
    timeline.add(tween({ duration: seconds }));
    return settle();
  }
  let wallTiles = [];   // 산 — 뽑기 순서대로
  let rivers = [];      // side → 버림패
  let melds = [];       // side → 공개 묶음 패들
  let hands = [];       // side → 상대 손패(뒷면)
  let dice = [];
  let winSpread = [];
  const sticks = [];
  let humanSide = 0;
  let seatSide = (seat) => seat; // newHand에서 실제 매핑으로 바뀐다
  let running = false;
  let last = 0;

  const say = () => sound?.sfx?.clack?.(0, { gain: 0.55 });

  function move(mesh, to, { duration = 0.42, delay = 0, height = 0.16, spin = 0, ease = easeOutCubic, onDone } = {}) {
    const from = mesh.position.clone();
    const rot = mesh.rotation.z;
    return timeline.add(
      tween({
        duration, delay, ease,
        onUpdate: (t) => {
          mesh.position.x = lerp(from.x, to.x, t);
          mesh.position.z = lerp(from.z, to.z, t);
          mesh.position.y = lerp(from.y, to.y, t) + arc(t, height);
          if (spin) mesh.rotation.z = lerp(rot, rot + spin, t);
        },
        onDone,
      })
    );
  }

  /* ── 배치 (기준 틀 → 회전) ────────────────────────── */

  function riverSpot(side, index) {
    const perRow = 7;
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    return orient(
      (col - (perRow - 1) / 2) * (TILE.w + 0.012),
      TILE.d / 2,
      BASE.river + row * (TILE.h + 0.012),
      side
    );
  }

  function meldSpot(side, meldIndex, tileIndex) {
    const groupX = -0.62 + meldIndex * (TILE.w * 3.3);
    return orient(groupX + tileIndex * (TILE.w + 0.004), TILE.d / 2, BASE.meld, side);
  }

  function handSpot(side, index, count) {
    const spread = Math.min(TILE.w + 0.004, 1.5 / Math.max(count, 1));
    return orient((index - (count - 1) / 2) * spread, TILE.h / 2, BASE.hand, side);
  }

  function stickSpot(side, i) {
    return orient(BASE.sticks[0] - 0.5, 0.02, BASE.sticks[1] + i * 0.035, side);
  }

  /** 패를 그 자리 방향으로 돌려 놓는다 */
  function faceSide(mesh, side, tilt = 0) {
    mesh.rotation.set(tilt, sideAngle(side), 0);
  }

  /* ── 모션 ─────────────────────────────────────────── */

  function clearHand() {
    timeline.clear();
    for (const list of [wallTiles, ...rivers, ...melds, ...hands, dice, winSpread]) {
      for (const mesh of list) recycle(mesh);
      list.length = 0;
    }
    dice = [];
    winSpread = [];
  }

  /** 섞기 → 산 쌓기 → 주사위 → 배패 */
  async function newHand(game, { humanSeat = 0, onStage = null, cats = null } = {}) {
    clearHand();
    sideCount = game.playerCount;
    humanSide = 0;
    seatSide = (seat) => (seat - humanSeat + sideCount) % sideCount;
    setCam(ceremonyView(sideCount));
    rivers = Array.from({ length: sideCount }, () => []);
    melds = Array.from({ length: sideCount }, () => []);
    hands = Array.from({ length: sideCount }, () => []);
    for (const hand of hands3d) scene.remove(hand);
    hands3d = Array.from({ length: sideCount }, (_, s) => buildHand(s !== 0));
    seatCats3d(cats);

    // 0) 첫 판이면 딜러 뽑기 — 내가 주사위를 굴리고 합만큼 세어 딜러가 정해진다
    if (game.handNumber === 1 && game.dealerRoll) {
      onStage?.("dealerRoll", game.dealerRoll);
      await rollDice(game.dealerRoll.dice, 0);
      await pause(1.4);
      for (const die of dice) recycle(die);
      dice = [];
    }

    onStage?.("shuffle");
    const total = game.pile.length + game.players.reduce(
      (n, p) => n + p.concealed.length + p.flowers.length, 0
    );

    // 1) 섞기 — 실제처럼: 패를 전부 엎어 흩뜨리고, 손이 휘저으며 이리저리 민다
    sound?.sfx?.shuffle?.(2.6);
    const swirl = [];
    const scatter = () => new THREE.Vector3(
      (Math.random() - 0.5) * 1.05,
      TILE.d / 2,
      (Math.random() - 0.5) * 0.8
    );
    for (let i = 0; i < 30; i++) {
      const mesh = makeTile(null);
      mesh.position.copy(scatter());
      mesh.rotation.y = Math.random() * Math.PI * 2;
      swirl.push(mesh);
    }
    // 세 차례에 걸쳐 각 패가 아무 데로나 미끄러진다 — 밀리고 부딪히는 섞기
    for (let round = 0; round < 3; round++) {
      for (const mesh of swirl) {
        const from = null;
        const to = scatter();
        const rotFrom = mesh.rotation.y;
        const rotTo = rotFrom + (Math.random() - 0.5) * 2.4;
        timeline.add(tween({
          duration: 0.55,
          delay: round * 0.62 + Math.random() * 0.25,
          ease: easeInOutQuad,
          onUpdate: (t) => {
            void from;
            mesh.position.x = lerp(mesh.userData.sx ?? mesh.position.x, to.x, t);
            mesh.position.z = lerp(mesh.userData.sz ?? mesh.position.z, to.z, t);
            mesh.rotation.y = lerp(rotFrom, rotTo, t);
            if (t >= 1) { mesh.userData.sx = to.x; mesh.userData.sz = to.z; }
            else if (mesh.userData.sx === undefined) { mesh.userData.sx = mesh.position.x; mesh.userData.sz = mesh.position.z; }
          },
        }));
      }
      // 손들이 원을 그리며 휘젓는다
      for (const [hi, hand] of hands3d.entries()) {
        if (hi > 1) break;
        hand.visible = true;
        const phase0 = hi * Math.PI;
        timeline.add(tween({
          duration: 0.62,
          delay: round * 0.62,
          ease: linearEase,
          onUpdate: (t) => {
            const a = phase0 + (round + t) * Math.PI * 1.6;
            hand.position.set(Math.cos(a) * 0.4, 0.11, Math.sin(a) * 0.3);
            hand.rotation.y = a;
          },
        }));
      }
    }
    await settle();
    for (const hand of hands3d) hand.visible = false;
    for (const mesh of swirl) { mesh.userData.sx = undefined; mesh.userData.sz = undefined; recycle(mesh); }

    // 2) 산 쌓기 — 인원수만큼의 벽을 아래 칸부터 2단으로.
    //    엔진이 정한 입구(주사위) 기준의 뽑기 순서를 그대로 물리 자리에 맞춘다.
    onStage?.("wall");
    const roll = game.log.find((e) => e.type === "dice");
    const opening = roll?.opening ?? { wallIndex: 0, stackIndex: 0 };
    const { counts, seq } = computeWallSequence(total, sideCount, opening);

    function wallPos(entry) {
      const stacks = counts[entry.wall];
      const spread = Math.min(TILE.w + 0.011, 1.06 / stacks); // 벽돌 사이 살짝 틈
      return orient(
        (entry.stack - (stacks - 1) / 2) * spread,
        TILE.d / 2 + entry.tier * TILE.d + 0.001,
        BASE.wall,
        seatSide(entry.wall)
      );
    }

    // 쌓는 모션은 물리 순서(벽마다 왼쪽부터, 아래 칸 먼저)
    const buildOrder = seq
      .map((entry, drawIndex) => ({ ...entry, drawIndex }))
      .sort((a, b) => a.wall - b.wall || a.stack - b.stack || a.tier - b.tier);
    wallTiles = new Array(seq.length);
    buildOrder.forEach((entry, i) => {
      const mesh = makeTile(null);
      mesh.material = mesh.material.slice();
      mesh.material[2] = entry.tier === 0 ? backMatLow : backMat; // 아래 칸은 그늘지게
      // 옆면을 낱장마다 다른 상아색으로 — 손으로 쌓은 티가 나게 미세하게 비틀어 놓는다
      const shades = entry.tier === 0 ? sideShadesLow : sideShades;
      const shade = shades[(entry.stack + entry.tier * 2 + entry.wall) % shades.length];
      for (const f of [0, 1, 4, 5]) mesh.material[f] = shade;
      faceSide(mesh, seatSide(entry.wall));
      mesh.rotation.y += (Math.random() - 0.5) * 0.045;
      mesh.position.set(0, 0.5, 0);
      wallTiles[entry.drawIndex] = mesh;
      const to = wallPos(entry);
      to.x += (Math.random() - 0.5) * 0.004;
      to.z += (Math.random() - 0.5) * 0.004;
      move(mesh, to, {
        duration: 0.34,
        delay: i * 0.009,
        height: 0.05,
        onDone: i % 9 === 0 ? say : undefined,
      });
    });
    await settle();
    await pause(0.4);

    // 산이 다 섰으니 카메라가 스르륵 내려간다 — 이제 상대 얼굴을 보며 친다
    onStage?.("camera");
    await glideCam(playView(sideCount), 2.2);

    // 3) 주사위 — 딜러 손이 던진다. 눈이 나온 뒤 잠깐 멈춰 읽을 시간을 준다.
    if (roll) {
      onStage?.("dice", roll);
      await rollDice(roll.dice, seatSide(game.dealerIndex));
      await pause(0.9);
    }

    // 4) 배패 — 실제 순서 그대로: 딜러부터 반시계로 돌며 각자 자기 손으로
    //    벽돌 2개(4장)씩 산 입구에서 집어 간다. 4바퀴 뒤 딜러만 1장 더.
    const order = Array.from({ length: sideCount }, (_, n) => (game.dealerIndex + n) % sideCount);
    const handTotal = {};
    for (const player of game.players) handTotal[player.seat] = player.concealed.length;

    for (let round = 0; round < 4; round++) {
      onStage?.("dealRound", { round: round + 1 });
      for (const seat of order) {
        const side = seatSide(seat);
        const grabbed = [];
        for (let k = 0; k < 4; k++) {
          const mesh = takeFromWall();
          if (!mesh) break;
          grabbed.push(mesh);
        }
        if (!grabbed.length) break;
        const grabAt = grabbed[0].position.clone();
        grabbed.forEach((mesh, k) => {
          const index = round * 4 + k;
          let to;
          if (side === 0) {
            to = orient((index - 8) * 0.055, 0.02, 1.5, 0);
          } else {
            hands[side].push(mesh);
            faceSide(mesh, side, -Math.PI / 2.2);
            to = handSpot(side, index, 16);
          }
          move(mesh, to, {
            duration: 0.5,
            delay: k * 0.08,
            height: 0.16,
            onDone: () => {
              sound?.sfx?.clack?.(0, { gain: 0.5 });
              if (side === 0) recycle(mesh);
            },
          });
        });
        // 그 자리 손이 함께 움직인다 (빈손으로 산까지 갔다 돌아온다)
        handCarry(side, null, grabAt, { duration: 0.55, grabAt });
        await settle();
        await pause(0.18);
      }
      await pause(0.3);
    }

    // 딜러의 17번째 한 장
    onStage?.("dealExtra");
    {
      const side = seatSide(game.dealerIndex);
      const mesh = takeFromWall();
      if (mesh) {
        const to = side === 0
          ? orient(0, 0.02, 1.5, 0)
          : handSpot(side, 16, 17);
        if (side !== 0) {
          hands[side].push(mesh);
          faceSide(mesh, side, -Math.PI / 2.2);
          reflowHand(side);
        }
        handCarry(side, mesh, to, {
          duration: 0.55,
          onDone: () => { if (side === 0) recycle(mesh); },
        });
        await settle();
      }
    }

    await settle();
    parkDice();
  }

  /** 배패가 끝난 주사위는 구석으로 */
  function parkDice() {
    dice.forEach((die, i) => {
      move(die, new THREE.Vector3(-0.95 + i * 0.13, 0.03, 0.86), { duration: 0.4, height: 0.06 });
      timeline.add(tween({
        duration: 0.4,
        onUpdate: (t) => die.scale.setScalar(lerp(1, 0.7, t)),
      }));
    });
  }

  function rollDice(values, dealerSide = 0) {
    for (const die of dice) recycle(die);
    dice = [];
    // 던지는 손 — 짧게 나타나 흔들고 사라진다
    const hand = hands3d[dealerSide];
    if (hand) {
      const rest = handRest(dealerSide);
      hand.visible = true;
      hand.position.copy(rest);
      const target = orient(0, 0.45, 0.45, dealerSide);
      timeline.add(tween({
        duration: 0.5, ease: easeInOutQuad,
        onUpdate: (t) => {
          hand.position.lerpVectors(rest, target, Math.min(1, t * 2));
          if (t > 0.5) hand.rotation.x = Math.sin((t - 0.5) * Math.PI * 4) * 0.5;
        },
        onDone: () => { hand.rotation.x = 0; hand.visible = false; },
      }));
    }
    sound?.sfx?.dice?.();
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    values.forEach((value, i) => {
      // 면 순서 [+X,-X,+Y,-Y,+Z,-Z] = [3,4,1,6,2,5] — 마주 보는 면끼리 합이 7
      const faces = [3, 4, 1, 6, 2, 5].map((v) => {
        const tex = new THREE.CanvasTexture(diceCanvas(v));
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
      });
      const die = new THREE.Mesh(geo, faces);
      die.castShadow = true;
      die.position.set(-0.4 + i * 0.8, 0.6, 0.1);
      scene.add(die);
      dice.push(die);
      const spin = new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      timeline.add(
        tween({
          duration: 1.0,
          ease: easeOutCubic,
          onUpdate: (t) => {
            die.position.x = lerp(-0.4 + i * 0.8, -0.13 + i * 0.26, t);
            die.position.z = lerp(0.1, -0.02, t);
            die.position.y = 0.045 + Math.abs(Math.cos(t * Math.PI * 2.5)) * 0.28 * (1 - t);
            die.rotation.set(spin.x * (1 - t) + Math.PI / 2, spin.y * (1 - t), spin.z * (1 - t));
          },
          onDone: () => {
            die.rotation.set(...UP_ROTATION[value]); // 굴린 눈이 위로
            sound?.sfx?.clack?.(0, { gain: 0.35, pitch: 1.8 });
          },
        })
      );
    });
    return settle();
  }

  /** 산에서 한 장 — 입구(앞)에서부터 */
  function takeFromWall() {
    return wallTiles.shift();
  }

  /** 상대 손패 줄 맞추기 */
  function reflowHand(side) {
    const list = hands[side];
    list.forEach((mesh, i) => {
      move(mesh, handSpot(side, i, list.length), { duration: 0.18, height: 0.01 });
    });
  }

  /** 뽑기 — 손이 산에서 한 장을 집어 온다 */
  function drawTile(seat, humanSeat = 0) {
    const mesh = takeFromWall();
    if (!mesh) return;
    const side = seatSide(seat);
    const to = side === 0
      ? orient(0, 0.02, 1.45, 0)
      : handSpot(side, hands[side].length, hands[side].length + 1);
    if (side !== 0) {
      hands[side].push(mesh);
      faceSide(mesh, side, -Math.PI / 2.2);
      reflowHand(side);
    }
    handCarry(side, mesh, to, {
      duration: 0.5,
      height: 0.16,
      onDone: () => { if (side === 0) recycle(mesh); },
    });
  }

  /** 버리기 — 손이 강에 패를 내려놓는다, 얼굴을 위로 */
  function discardTile(seat, tile, humanSeat = 0) {
    const side = seatSide(seat);
    const mesh = makeTile(tile);
    const index = rivers[side].length;
    mesh.position.copy(orient(0, 0.02, BASE.hand * 0.9, side));
    faceSide(mesh, side);
    rivers[side].push(mesh);
    if (side !== 0 && hands[side].length) { recycle(hands[side].pop()); reflowHand(side); }
    handCarry(side, mesh, riverSpot(side, index), { duration: 0.5, height: 0.13 });
  }

  /** 부르기 — 방금 버려진 패가 묶음 자리로 날아가고 나머지가 함께 눕는다 */
  function meldTiles(seat, tiles, fromSeat, humanSeat = 0) {
    const side = seatSide(seat);
    const fromSide = seatSide(fromSeat);
    const taken = rivers[fromSide].pop();
    if (taken) recycle(taken);
    const meldIndex = Math.floor(melds[side].length / 3);
    tiles.forEach((tile, i) => {
      const mesh = makeTile(tile);
      mesh.position.copy(orient(0, 0.02, BASE.river, side));
      faceSide(mesh, side);
      melds[side].push(mesh);
      move(mesh, meldSpot(side, meldIndex, i), {
        duration: 0.32,
        delay: i * 0.05,
        height: 0.12,
        onDone: () => sound?.sfx?.clack?.(0, { gain: 0.7 }),
      });
    });
    if (side !== 0) {
      for (let i = 0; i < tiles.length - 1 && hands[side].length; i++) recycle(hands[side].pop());
      reflowHand(side);
    }
  }

  /** 완성 — 이긴 손패를 가운데 두 줄로 펼친다 */
  function revealWin(sets, pair) {
    const groups = [...sets, pair];
    const rows = [groups.slice(0, 3), groups.slice(3)];
    rows.forEach((row, r) => {
      const width = row.reduce((w, g) => w + g.length * TILE.w + 0.05, 0);
      let x = -width / 2;
      const z = -0.14 + r * (TILE.h + 0.03);
      row.forEach((group, gi) => {
        group.forEach((tile, i) => {
          const mesh = makeTile(tile);
          mesh.position.set(0, 0.45, z);
          winSpread.push(mesh);
          move(mesh, new THREE.Vector3(x + i * TILE.w + TILE.w / 2, TILE.d / 2, z), {
            duration: 0.4,
            delay: r * 0.24 + gi * 0.1 + i * 0.04,
            height: 0.18,
            onDone: () => sound?.sfx?.clack?.(0, { gain: 0.6 }),
          });
        });
        x += group.length * TILE.w + 0.05;
      });
    });
    sound?.sfx?.fanfare?.();
  }

  /** 산가지가 건너간다 */
  function payment(moves, humanSeat = 0) {
    for (const [m, pay] of moves.entries()) {
      const fromSide = seatSide(pay.from);
      const toSide = seatSide(pay.to);
      const count = Math.min(4, Math.max(1, Math.round(pay.amount / 20)));
      for (let i = 0; i < count; i++) {
        const stickMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xf3ecd8, roughness: 0.5 })
        );
        stickMesh.castShadow = true;
        stickMesh.rotation.z = Math.PI / 2;
        stickMesh.position.copy(stickSpot(fromSide, i));
        scene.add(stickMesh);
        sticks.push(stickMesh);
        move(stickMesh, stickSpot(toSide, i), {
          duration: 0.5,
          delay: m * 0.2 + i * 0.08,
          height: 0.22,
          onDone: () => {
            sound?.sfx?.stick?.(0);
            scene.remove(stickMesh);
          },
        });
      }
    }
  }

  /** 상태 그대로 다시 깔기 — 한 수 물린 뒤처럼 화면과 상태가 어긋났을 때 */
  function rebuild(game, humanSeat = 0, cats = null) {
    clearHand();
    sideCount = game.playerCount;
    seatSide = (seat) => (seat - humanSeat + sideCount) % sideCount;
    setCam(playView(sideCount));
    seatCats3d(cats);
    rivers = Array.from({ length: sideCount }, () => []);
    melds = Array.from({ length: sideCount }, () => []);
    hands = Array.from({ length: sideCount }, () => []);
    {
      const total = game.pile.length;
      const { counts, seq } = computeWallSequence(total + (total % 2), sideCount);
      for (let i = 0; i < total; i++) {
        const entry = seq[i];
        const stacks = counts[entry.wall];
        const spread = Math.min(TILE.w + 0.011, 1.06 / stacks);
        const mesh = makeTile(null);
        mesh.material = mesh.material.slice();
        mesh.material[2] = entry.tier === 0 ? backMatLow : backMat;
        const shades = entry.tier === 0 ? sideShadesLow : sideShades;
        const shade = shades[(entry.stack + entry.tier * 2 + entry.wall) % shades.length];
        for (const f of [0, 1, 4, 5]) mesh.material[f] = shade;
        faceSide(mesh, seatSide(entry.wall));
        mesh.rotation.y += (Math.random() - 0.5) * 0.045;
        mesh.position.copy(orient(
          (entry.stack - (stacks - 1) / 2) * spread,
          TILE.d / 2 + entry.tier * TILE.d,
          BASE.wall,
          seatSide(entry.wall)
        ));
        wallTiles.push(mesh);
      }
    }
    for (const player of game.players) {
      const side = seatSide(player.seat);
      if (side !== 0) {
        player.concealed.forEach((_, i) => {
          const mesh = makeTile(null);
          faceSide(mesh, side, -Math.PI / 2.2);
          mesh.position.copy(handSpot(side, i, player.concealed.length));
          hands[side].push(mesh);
        });
      }
      player.discards.forEach((tile, i) => {
        const mesh = makeTile(tile);
        faceSide(mesh, side);
        mesh.position.copy(riverSpot(side, i));
        rivers[side].push(mesh);
      });
      player.melds.forEach((meld, mi) => {
        meld.tiles.forEach((tile, i) => {
          const mesh = makeTile(tile);
          faceSide(mesh, side);
          mesh.position.copy(meldSpot(side, mi, i));
          melds[side].push(mesh);
        });
      });
    }
  }

  /** 남은 산 길이를 게임 상태에 맞춘다 — 꽃·깡 보충은 담 뒤쪽에서 나간다 */
  function sync(game) {
    const target = game.pile.length;
    while (wallTiles.length > target) {
      const mesh = wallTiles.pop();
      if (mesh) recycle(mesh);
    }
  }

  function settle() {
    return new Promise((resolve) => {
      const check = () => {
        if (!timeline.busy) return resolve();
        requestAnimationFrame(check);
      };
      check();
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = h > w ? 52 : 40;
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    timeline.update(dt / speed);
    animateCats(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    resize();
    requestAnimationFrame(frame);
  }

  return {
    ok: true,
    setSpeed(x) { speed = Math.max(0.5, x); },
    start,
    stop() { running = false; },
    resize,
    newHand,
    drawTile,
    discardTile,
    meldTiles,
    revealWin,
    payment,
    sync,
    rebuild,
    clearHand,
    // 화면을 눈으로 확인할 때 들여다보는 창구
    debug: {
      scene, camera,
      get wallTiles() { return wallTiles; },
      get hands() { return hands; },
      get rivers() { return rivers; },
      get melds() { return melds; },
      get dice() { return dice; },
    },
  };
}
