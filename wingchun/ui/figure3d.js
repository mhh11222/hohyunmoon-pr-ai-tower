// 3D 인체 — three.js. 관절은 구, 뼈는 원기둥. 왼쪽은 청록, 오른쪽은 주황으로 구분한다.
// 유령(전 자세)·기준(책 자세)을 반투명으로 겹칠 수 있고, 선택한 각도는 호(arc)로 그린다.
import { BONES, J, sideOf } from "../src/skeleton.js";
import { Orbit } from "./controls.js";

const COLORS = {
  left: 0x2ec4b6,
  right: 0xff9f43,
  center: 0xe9e4d6,
  bone: 0xd9d2c0,
  ghost: 0x9aa4b2,
  ref: 0x7bdc6a,
  user: 0xff4fd8,
  arc: 0xfff275,
  select: 0xffffff,
};

const BONE_RADIUS = (a, b) => {
  const torso = new Set([11, 12, 23, 24]);
  if (torso.has(a) && torso.has(b)) return 0.045;
  if (a >= 15 && b >= 17 && b <= 22) return 0.011; // 손
  if (a >= 27) return 0.016; // 발
  return 0.03;
};

const JOINT_RADIUS = (i) => {
  if (i === 0) return 0.02;
  if (i >= 1 && i <= 10) return 0.0;      // 얼굴 점은 머리 구로 대신
  if (i >= 17 && i <= 22) return 0.014;
  if (i >= 29) return 0.018;
  return 0.036;
};

export async function createFigure(canvas, { coarse = false } = {}) {
  let THREE;
  try {
    // CSP(script-src 'self')와 맞추기 위해 importmap 없이 상대 경로로 직접 불러온다
    THREE = await import("../../mahjong/vendor/three.module.min.js");
  } catch (e) {
    console.error(e);
    return null;
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  // 폰(터치)에서는 픽셀 비율을 낮추고 그림자를 끈다 — 배터리·발열
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
  const orbit = new Orbit(camera, canvas, { target: [0, 0.05, 0], distance: 3.1, minDistance: 0.6, maxDistance: 7 });
  orbit.setView("iso");

  // 조명
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2622, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.set(1.5, 3, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -2; sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 2; sun.shadow.camera.bottom = -2;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5);
  fill.position.set(-2, 1, -1.5);
  scene.add(fill);

  // 바닥 + 격자 + 중심선
  const FLOOR_Y = -0.93;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x26302c, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(3.2, 16, 0x5a6a62, 0x3a4741);
  grid.position.y = FLOOR_Y + 0.002;
  scene.add(grid);
  // 중심선(中線): 몸 한가운데를 앞뒤로 지나는 세로 면. 영춘권의 기준선.
  const center = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.1),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  center.rotation.y = Math.PI / 2;
  center.position.set(0, FLOOR_Y + 1.05, 0.2);
  scene.add(center);
  const centerLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, FLOOR_Y + 0.003, -0.5), new THREE.Vector3(0, FLOOR_Y + 0.003, 0.9)]),
    new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6 }),
  );
  scene.add(centerLine);

  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  const unitSphere = new THREE.SphereGeometry(1, 18, 14);
  const Y = new THREE.Vector3(0, 1, 0);

  /** 뼈·관절 묶음을 하나 만든다 (본체 / 유령 / 기준용) */
  function buildBody({ opacity = 1, tint = null, castShadow = true } = {}) {
    const group = new THREE.Group();
    const mat = (color) => new THREE.MeshStandardMaterial({
      color: tint ?? color, roughness: 0.55, metalness: 0.05,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    });
    const boneMat = mat(COLORS.bone);
    const sideMat = { left: mat(COLORS.left), right: mat(COLORS.right), center: mat(COLORS.center) };
    const bones = BONES.map(([a, b]) => {
      const m = new THREE.Mesh(unitCyl, tint ? boneMat : sideMat[sideOf(a) === sideOf(b) ? sideOf(a) : "center"]);
      m.castShadow = castShadow;
      m.userData = { a, b, r: BONE_RADIUS(a, b) };
      group.add(m);
      return m;
    });
    const joints = [];
    for (let i = 0; i < 33; i++) {
      const r = JOINT_RADIUS(i);
      if (r <= 0) { joints.push(null); continue; }
      const m = new THREE.Mesh(unitSphere, tint ? boneMat : sideMat[sideOf(i)]);
      m.scale.setScalar(r);
      m.castShadow = castShadow;
      m.userData = { i, r };
      group.add(m);
      joints.push(m);
    }
    const head = new THREE.Mesh(unitSphere, tint ? boneMat : sideMat.center);
    head.castShadow = castShadow;
    group.add(head);
    // 척추(골반 중심→어깨 중심)와 목(어깨 중심→머리)
    const spine = new THREE.Mesh(unitCyl, tint ? boneMat : sideMat.center);
    const neck = new THREE.Mesh(unitCyl, tint ? boneMat : sideMat.center);
    spine.castShadow = neck.castShadow = castShadow;
    group.add(spine, neck);
    scene.add(group);
    return { group, bones, joints, head, spine, neck, mats: [boneMat, ...Object.values(sideMat)] };
  }

  function placeCylinder(mesh, from, to, r) {
    v.d.subVectors(to, from);
    mesh.position.addVectors(from, to).multiplyScalar(0.5);
    mesh.scale.set(r, Math.max(v.d.length(), 1e-4), r);
    mesh.quaternion.setFromUnitVectors(Y, v.d.normalize());
  }

  const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3() };
  function poseBody(body, lm) {
    for (const m of body.bones) {
      const { a, b, r } = m.userData;
      v.a.fromArray(lm[a]); v.b.fromArray(lm[b]);
      v.d.subVectors(v.b, v.a);
      const len = v.d.length();
      m.position.addVectors(v.a, v.b).multiplyScalar(0.5);
      m.scale.set(r, Math.max(len, 1e-4), r);
      m.quaternion.setFromUnitVectors(Y, v.d.normalize());
    }
    for (const m of body.joints) {
      if (!m) continue;
      m.position.fromArray(lm[m.userData.i]);
    }
    // 머리: 양 귀 중점을 중심으로, 귀 간격의 0.75배 반지름
    v.a.fromArray(lm[J.left_ear]); v.b.fromArray(lm[J.right_ear]);
    const earDist = v.a.distanceTo(v.b);
    body.head.position.addVectors(v.a, v.b).multiplyScalar(0.5);
    body.head.position.y += earDist * 0.1;
    body.head.scale.setScalar(Math.max(0.07, earDist * 0.72));
    const hipC = new THREE.Vector3().fromArray(lm[J.left_hip]).add(new THREE.Vector3().fromArray(lm[J.right_hip])).multiplyScalar(0.5);
    const shC = new THREE.Vector3().fromArray(lm[J.left_shoulder]).add(new THREE.Vector3().fromArray(lm[J.right_shoulder])).multiplyScalar(0.5);
    placeCylinder(body.spine, hipC, shC, 0.05);
    placeCylinder(body.neck, shC, body.head.position, 0.03);
  }

  const main = buildBody();
  const ghost = buildBody({ opacity: 0.28, tint: COLORS.ghost, castShadow: false });
  const ref = buildBody({ opacity: 0.45, tint: COLORS.ref, castShadow: false });
  const user = buildBody({ opacity: 0.6, tint: COLORS.user, castShadow: false });
  ghost.group.visible = false;
  ref.group.visible = false;
  user.group.visible = false;

  // 선택 관절 하이라이트 링 + 각도 호
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.08, 8, 32),
    new THREE.MeshBasicMaterial({ color: COLORS.select, transparent: true, opacity: 0.9 }),
  );
  ring.visible = false;
  scene.add(ring);
  // 각도 호: 정점 버퍼를 한 번만 만들고 매 프레임 값만 갱신한다
  const ARC_N = 24;
  const arcPos = new THREE.Float32BufferAttribute(new Float32Array((ARC_N + 1) * 3), 3);
  const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute("position", arcPos);
  const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: COLORS.arc }));
  const fillPos = new THREE.Float32BufferAttribute(new Float32Array(ARC_N * 9), 3);
  const fillGeo = new THREE.BufferGeometry(); fillGeo.setAttribute("position", fillPos);
  const arcFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: COLORS.arc, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  arcLine.visible = arcFill.visible = false;
  arcLine.frustumCulled = arcFill.frustumCulled = false;
  scene.add(arcLine, arcFill);
  const tmpB = new THREE.Vector3(), tmpU = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Vector3();

  let currentLm = null;
  let highlight = null; // {a,b,c} 또는 {joint}

  function updateHighlight() {
    if (!currentLm || !highlight) { ring.visible = arcLine.visible = arcFill.visible = false; return; }
    const lm = currentLm;
    const jointIdx = highlight.b ?? highlight.joint;
    ring.position.fromArray(lm[jointIdx]);
    ring.scale.setScalar(0.055);
    ring.quaternion.copy(camera.quaternion);
    ring.visible = true;
    if (highlight.a !== undefined && highlight.c !== undefined) {
      tmpB.fromArray(lm[highlight.b]);
      tmpU.fromArray(lm[highlight.a]).sub(tmpB).normalize();
      tmpW.fromArray(lm[highlight.c]).sub(tmpB).normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, tmpU.dot(tmpW))));
      tmpN.crossVectors(tmpU, tmpW);
      if (tmpN.lengthSq() < 1e-8) tmpN.set(0, 1, 0);
      tmpN.normalize();
      const R = 0.11;
      tmpQ.copy(tmpU).multiplyScalar(R).add(tmpB);
      for (let i = 0; i <= ARC_N; i++) {
        tmpP.copy(tmpU).applyAxisAngle(tmpN, (ang * i) / ARC_N).multiplyScalar(R).add(tmpB);
        arcPos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
        if (i > 0) {
          const k = (i - 1) * 3;
          fillPos.setXYZ(k, tmpB.x, tmpB.y, tmpB.z);
          fillPos.setXYZ(k + 1, tmpQ.x, tmpQ.y, tmpQ.z);
          fillPos.setXYZ(k + 2, tmpP.x, tmpP.y, tmpP.z);
        }
        tmpQ.copy(tmpP);
      }
      arcPos.needsUpdate = true; fillPos.needsUpdate = true;
      arcLine.visible = arcFill.visible = true;
    } else {
      arcLine.visible = arcFill.visible = false;
    }
  }

  // 크기는 ResizeObserver로만 맞춘다 (매 프레임 clientWidth 읽기 = 강제 레이아웃)
  let needResize = true;
  const api = { onResize: null };
  new ResizeObserver(() => { needResize = true; api.onResize?.(); }).observe(canvas);
  function resize() {
    if (!needResize) return;
    needResize = false;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const proj = new THREE.Vector3();
  return Object.assign(api, {
    orbit,
    setPose(lm) { currentLm = lm; poseBody(main, lm); updateHighlight(); },
    setGhost(lm) { ghost.group.visible = !!lm; if (lm) poseBody(ghost, lm); },
    setRef(lm) { ref.group.visible = !!lm; if (lm) poseBody(ref, lm); },
    /** 카메라로 인식한 내 자세 (분홍, 반투명) */
    setUser(lm) { user.group.visible = !!lm; if (lm) poseBody(user, lm); },
    setHighlight(h) { highlight = h; updateHighlight(); },
    setView(name) { orbit.setView(name); },
    /** 월드 좌표 → 캔버스 픽셀 (라벨 위치). 화면 밖이면 null */
    project(p) {
      proj.fromArray(p).project(camera);
      if (proj.z > 1) return null;
      return { x: ((proj.x + 1) / 2) * canvas.clientWidth, y: ((1 - proj.y) / 2) * canvas.clientHeight };
    },
    render() { resize(); ring.quaternion.copy(camera.quaternion); renderer.render(scene, camera); },
    dispose() { renderer.dispose(); },
  });
}
