// 3D 테이블 — three.js. 규칙은 하나도 모르고, "이런 모션을 보여 달라"는 주문만 받는다.
//
// 좌표: 카메라는 +z 쪽(내 자리)에서 테이블을 내려다본다.
//   -z 상대 자리   +z 내 자리   y 위쪽
// 패는 눕힌 상자. 윗면(+Y)이 얼굴, 아랫면(-Y)이 초록 뒷면이다.

import { Timeline, tween, lerp, arc, easeOutCubic, easeInOutQuad } from "./anim.js";
import { faceCanvas, diceCanvas } from "./tiletexture.js";

const TILE = { w: 0.068, h: 0.095, d: 0.046 };
const TABLE = { w: 2.3, d: 2.1 };

/** 자리별 구역 (2인 기준: 0 = 나(+z), 1 = 상대(-z)) */
const ZONES = [
  { hand: 0.74, wall: 0.56, meld: 0.38, river: 0.1, dir: 1, sticks: [0.84, 0.54] },
  { hand: -0.74, wall: -0.56, meld: -0.38, river: -0.14, dir: -1, sticks: [-0.84, -0.54] },
];

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
  camera.position.set(0, 1.78, 1.12);
  camera.lookAt(0, 0, -0.06);

  scene.add(new THREE.HemisphereLight(0xdfeee6, 0x0a2a1f, 0.9));
  const key = new THREE.DirectionalLight(0xfff6e0, 1.35);
  key.position.set(-1.1, 2.7, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.6;
  key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 1.6;
  key.shadow.camera.bottom = -1.6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 6;
  key.shadow.bias = -0.0015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd6b4, 0.35);
  rim.position.set(1.6, 1.2, -1.8);
  scene.add(rim);

  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.w, TABLE.d),
    new THREE.MeshStandardMaterial({ color: 0x14523c, roughness: 0.95, metalness: 0 })
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  scene.add(felt);

  const rimGeo = new THREE.BoxGeometry(TABLE.w + 0.16, 0.07, TABLE.d + 0.16);
  const rimMesh = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0x0c3627, roughness: 0.6 }));
  rimMesh.position.y = -0.05;
  scene.add(rimMesh);

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
  const backMat = new THREE.MeshStandardMaterial({ color: 0xc99e5f, roughness: 0.55 }); // 대나무 등판
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

  /** 산에서 한 장 — 입구(앞)에서부터 */
  function takeFromWall() {
    return wallTiles.shift();
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
      // 고양이 앞발 — 둥근 발과 발가락 세 개
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), mat);
      paw.scale.set(1, 0.62, 1.15);
      group.add(paw);
      for (let i = -1; i <= 1; i++) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mat);
        toe.position.set(i * 0.038, -0.008, -0.062);
        group.add(toe);
      }
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 10), mat);
      leg.rotation.x = Math.PI / 2.4;
      leg.position.set(0, 0.1, 0.2);
      group.add(leg);
    } else {
      // 사람 손 — 손바닥, 손가락 네 개, 엄지
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
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.3, 10), mat);
      wrist.rotation.x = Math.PI / 2.35;
      wrist.position.set(0, 0.03, 0.17);
      group.add(wrist);
    }
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    group.visible = false;
    scene.add(group);
    return group;
  }

  const HAND_REST = [new THREE.Vector3(0.3, 0.42, 1.5), new THREE.Vector3(-0.3, 0.42, -1.5)];
  const hands3d = [buildHand(false), buildHand(true)];
  hands3d[1].rotation.y = Math.PI; // 상대 발은 반대쪽에서 들어온다

  /**
   * 손이 from까지 와서 mesh를 집고 to에 놓고 물러난다.
   * mesh가 null이면 빈손 동작(주사위 던지기 등).
   */
  function handCarry(side, mesh, to, { duration = 0.55, height = 0.14, grabAt = null, onDone = null } = {}) {
    const hand = hands3d[side];
    const rest = HAND_REST[side];
    const lift = 0.075; // 손바닥 아래 패가 붙는 높이
    const from = grabAt ? grabAt.clone() : (mesh ? mesh.position.clone() : to.clone());
    const reach = duration * 0.45;
    const carry = duration * 0.55;
    hand.visible = true;
    hand.position.copy(rest);

    // 1) 빈손이 패 있는 곳까지
    timeline.add(tween({
      duration: reach, ease: easeOutCubic,
      onUpdate: (t) => {
        hand.position.lerpVectors(rest, new THREE.Vector3(from.x, from.y + lift, from.z), t);
      },
    }));
    // 2) 집어서 목적지로 — 패가 손을 따라간다
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
    // 3) 빈손이 물러난다
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
  const wallTiles = [];      // 산 — 뽑기 순서대로
  const rivers = [[], []];   // 버림패
  const melds = [[], []];    // 공개 묶음
  const hands = [[], []];    // 상대 손패(뒷면)
  const sticks = [];
  let dice = [];
  let winSpread = [];
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

  /* ── 배치 ─────────────────────────────────────────── */

  function riverSpot(seat, index) {
    const perRow = 8;
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const zone = ZONES[seat];
    return new THREE.Vector3(
      (col - (perRow - 1) / 2) * (TILE.w + 0.012),
      TILE.d / 2,
      zone.river + row * (TILE.h + 0.012) * zone.dir * -1
    );
  }

  function meldSpot(seat, meldIndex, tileIndex) {
    const zone = ZONES[seat];
    const groupX = -0.66 + meldIndex * (TILE.w * 3.3);
    return new THREE.Vector3(
      (groupX + tileIndex * (TILE.w + 0.004)) * zone.dir,
      TILE.d / 2,
      zone.meld
    );
  }

  function wallSpot(index, total) {
    // 두 벽으로 나눠 2단으로 쌓는다
    const perWall = Math.ceil(total / 2);
    const wall = index < perWall ? 0 : 1;
    const within = index - wall * perWall;
    const stacks = Math.ceil(perWall / 2);
    const stackIndex = Math.floor(within / 2);
    const tier = within % 2 === 0 ? 1 : 0; // 위 칸 먼저 뽑는다
    const zone = ZONES[wall === 0 ? 1 : 0];
    const spread = Math.min(TILE.w + 0.006, 2.5 / stacks);
    return new THREE.Vector3(
      (stackIndex - (stacks - 1) / 2) * spread * (wall === 0 ? 1 : -1),
      TILE.d / 2 + tier * TILE.d,
      zone.wall
    );
  }

  function handSpot(seat, index, count) {
    const zone = ZONES[seat];
    const spread = Math.min(TILE.w + 0.004, 2.0 / Math.max(count, 1));
    return new THREE.Vector3(
      (index - (count - 1) / 2) * spread * zone.dir,
      TILE.h / 2,
      zone.hand
    );
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
  async function newHand(game, { humanSeat = 0, onStage = null } = {}) {
    clearHand();
    onStage?.("shuffle");
    const total = game.pile.length + game.players.reduce(
      (n, p) => n + p.concealed.length + p.flowers.length, 0
    );

    // 1) 섞기 — 엎은 패가 가운데서 휘휘 돈다
    sound?.sfx?.shuffle?.(1.1);
    const swirl = [];
    for (let i = 0; i < 24; i++) {
      const mesh = makeTile(null);
      const angle = (i / 24) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 0.5, TILE.d / 2, Math.sin(angle) * 0.35);
      mesh.rotation.y = angle;
      swirl.push(mesh);
      timeline.add(
        tween({
          duration: 1.1,
          ease: easeInOutQuad,
          onUpdate: (t) => {
            const a = angle + t * Math.PI * 2.2;
            const r = lerp(0.5, 0.12, t);
            mesh.position.x = Math.cos(a) * r;
            mesh.position.z = Math.sin(a) * r * 0.7;
            mesh.position.y = TILE.d / 2 + arc(t, 0.12);
            mesh.rotation.y = a;
          },
        })
      );
    }
    await settle();
    for (const mesh of swirl) recycle(mesh);

    // 2) 산 쌓기 — 2단으로
    onStage?.("wall");
    for (let i = 0; i < total; i++) {
      const mesh = makeTile(null);
      const to = wallSpot(i, total);
      mesh.position.set(0, 0.5, 0);
      mesh.visible = true;
      wallTiles.push(mesh);
      move(mesh, to, { duration: 0.34, delay: i * 0.006, height: 0.05, onDone: i % 9 === 0 ? say : undefined });
    }
    await settle();

    // 3) 주사위
    const roll = game.log.find((e) => e.type === "dice");
    if (roll) { onStage?.("dice", roll); await rollDice(roll.dice, 0); }

    // 4) 배패 — 상대 손패는 뒷면으로 세워 놓고, 내 몫은 화면 아래(내 손)로 내려간다
    onStage?.("deal");
    sound?.sfx?.clack?.(0, { gain: 0.5 });
    const opponent = game.players.find((p) => p.seat !== humanSeat);
    const opponentSeat = opponent ? 1 : 1;
    const count = opponent ? opponent.concealed.length : 16;
    for (let i = 0; i < count; i++) {
      const mesh = takeFromWall();
      if (!mesh) break;
      hands[opponentSeat].push(mesh);
      mesh.rotation.x = -Math.PI / 2.2;
      move(mesh, handSpot(opponentSeat, i, count), { duration: 0.3, delay: i * 0.03, height: 0.2 });
      if (i % 4 === 0) sound?.sfx?.clack?.(i * 0.03, { gain: 0.4 });
    }
    const mine = game.players[humanSeat].concealed.length;
    for (let i = 0; i < mine; i++) {
      const mesh = takeFromWall();
      if (!mesh) break;
      move(mesh, new THREE.Vector3((i - mine / 2) * 0.05, 0.02, 1.5), {
        duration: 0.36,
        delay: i * 0.03,
        height: 0.24,
        onDone: () => recycle(mesh),
      });
      if (i % 4 === 0) sound?.sfx?.clack?.(i * 0.03, { gain: 0.45 });
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
    const rest = HAND_REST[dealerSide];
    hand.visible = true;
    hand.position.copy(rest);
    timeline.add(tween({
      duration: 0.5, ease: easeInOutQuad,
      onUpdate: (t) => {
        hand.position.lerpVectors(rest, new THREE.Vector3(0, 0.45, dealerSide === 0 ? 0.45 : -0.45), Math.min(1, t * 2));
        if (t > 0.5) hand.rotation.x = Math.sin((t - 0.5) * Math.PI * 4) * 0.5;
      },
      onDone: () => { hand.rotation.x = 0; hand.visible = false; },
    }));
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

  /** 상대 손패 줄 맞추기 */
  function reflowHand(side) {
    const list = hands[side];
    list.forEach((mesh, i) => {
      const to = handSpot(side, i, list.length);
      move(mesh, to, { duration: 0.18, height: 0.01 });
    });
  }

  /** 뽑기 — 손이 산에서 한 장을 집어 온다 */
  function drawTile(seat, humanSeat = 0) {
    const mesh = takeFromWall();
    if (!mesh) return;
    const side = seat === humanSeat ? 0 : 1;
    const to = side === 0
      ? new THREE.Vector3(0, 0.02, 1.45)
      : handSpot(1, hands[1].length, hands[1].length + 1);
    if (side === 1) { hands[1].push(mesh); reflowHand(1); }
    handCarry(side, mesh, to, {
      duration: 0.5,
      height: 0.16,
      onDone: () => { if (side === 0) recycle(mesh); },
    });
  }

  /** 버리기 — 손이 강에 패를 내려놓는다, 얼굴을 위로 */
  function discardTile(seat, tile, humanSeat = 0) {
    const side = seat === humanSeat ? 0 : 1;
    const zone = ZONES[side];
    const mesh = makeTile(tile);
    const index = rivers[side].length;
    mesh.position.set(0, 0.02, zone.hand * 0.9);
    rivers[side].push(mesh);
    if (side === 1 && hands[1].length) { recycle(hands[1].pop()); reflowHand(1); }
    handCarry(side, mesh, riverSpot(side, index), { duration: 0.5, height: 0.13 });
  }

  /** 부르기 — 방금 버려진 패가 묶음 자리로 날아가고 나머지가 함께 눕는다 */
  function meldTiles(seat, tiles, fromSeat, humanSeat = 0) {
    const side = seat === humanSeat ? 0 : 1;
    const fromSide = fromSeat === humanSeat ? 0 : 1;
    const taken = rivers[fromSide].pop();
    if (taken) recycle(taken);
    const meldIndex = melds[side].length;
    const group = [];
    tiles.forEach((tile, i) => {
      const mesh = makeTile(tile);
      mesh.position.set(0, 0.02, ZONES[side].river);
      group.push(mesh);
      move(mesh, meldSpot(side, meldIndex, i), {
        duration: 0.32,
        delay: i * 0.05,
        height: 0.12,
        onDone: () => sound?.sfx?.clack?.(0, { gain: 0.7 }),
      });
    });
    melds[side].push(...group);
    if (side === 1) {
      for (let i = 0; i < tiles.length - 1 && hands[1].length; i++) recycle(hands[1].pop());
      reflowHand(1);
    }
  }

  /** 완성 — 이긴 손패를 가운데 펼친다 */
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
      const fromSide = pay.from === humanSeat ? 0 : 1;
      const toSide = pay.to === humanSeat ? 0 : 1;
      const count = Math.min(4, Math.max(1, Math.round(pay.amount / 20)));
      for (let i = 0; i < count; i++) {
        const stickMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: 0xf3ecd8, roughness: 0.5 })
        );
        stickMesh.rotation.z = Math.PI / 2;
        const [fx, fz] = ZONES[fromSide].sticks;
        const [tx, tz] = ZONES[toSide].sticks;
        stickMesh.position.set(fx, 0.02, fz + i * 0.035);
        scene.add(stickMesh);
        sticks.push(stickMesh);
        move(stickMesh, new THREE.Vector3(tx, 0.02, tz + i * 0.035), {
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
  function rebuild(game, humanSeat = 0) {
    clearHand();
    for (let i = 0; i < game.pile.length; i++) {
      const mesh = makeTile(null);
      mesh.position.copy(wallSpot(i, game.pile.length));
      wallTiles.push(mesh);
    }
    for (const player of game.players) {
      const side = player.seat === humanSeat ? 0 : 1;
      if (side === 1) {
        player.concealed.forEach((_, i) => {
          const mesh = makeTile(null);
          mesh.rotation.x = -Math.PI / 2.2;
          mesh.position.copy(handSpot(1, i, player.concealed.length));
          hands[1].push(mesh);
        });
      }
      player.discards.forEach((tile, i) => {
        const mesh = makeTile(tile);
        mesh.position.copy(riverSpot(side, i));
        rivers[side].push(mesh);
      });
      player.melds.forEach((meld, mi) => {
        meld.tiles.forEach((tile, i) => {
          const mesh = makeTile(tile);
          mesh.position.copy(meldSpot(side, mi, i));
          melds[side].push(mesh);
        });
      });
    }
  }

  /** 남은 산 길이를 게임 상태에 맞춘다 */
  function sync(game) {
    const back = game.log.filter((e) => e.type === "flower" || e.type === "kongReplacement").length;
    const target = game.pile.length;
    while (wallTiles.length > target) {
      const mesh = takeFromWall();
      if (mesh) recycle(mesh);
    }
    void back;
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
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    timeline.update(dt);
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
    debug: { scene, camera, wallTiles, hands, rivers, melds, get dice() { return dice; } },
  };
}
