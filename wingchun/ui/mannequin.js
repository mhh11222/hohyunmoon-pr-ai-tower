// 인체 마네킹 — 리깅된 사람 모델(Mixamo X Bot, 키 1.81m, 실제 인체 비율)을 관절 좌표로 움직인다.
// 방식: 각 뼈의 "휴식 자세 방향"을 목표 방향(관절→관절)으로 돌리는 리타게팅. 팔다리 길이는 모델 것을 쓰고
// 방향만 사람의 것을 따르므로, 인식 오차로 뼈가 늘어나거나 줄어드는 일이 없다.
// 좌표 규약은 데이터와 같다: +x 본인의 왼쪽, +y 위, +z 앞. X Bot의 휴식 자세(T 포즈)도 같은 방향을 본다.
import { J } from "../src/skeleton.js";
import { bodyFrame, mid, sub, normalize, cross, dot, dist } from "../src/angles.js";

const MODEL_HIP_TO_ANKLE = 0.888; // X Bot: 골반(0.972) → 발목(0.084)

/**
 * @param {*} THREE  three.js 모듈
 * @param {string} url  GLB 경로
 * @returns {Promise<{group, setPose(lm), setOpacity(o), dispose()}>}
 */
export async function loadMannequin(THREE, url) {
  const { GLTFLoader } = await import("../vendor/three/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const bone = {};
  root.traverse((o) => { if (o.isBone) bone[o.name.replace(/^mixamorig/, "")] = o; });
  const need = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"];
  for (const n of need) if (!bone[n]) throw new Error(`마네킹에 ${n} 뼈가 없습니다`);
  const handTip = (side) => bone[`${side}HandMiddle1`] || bone[`${side}Hand`].children.find((c) => c.isBone);

  // 휴식 자세의 세계 방향·회전을 기억해 둔다 (매 프레임 여기서 출발)
  const restPos = {}, restQuat = {};
  for (const [n, b] of Object.entries(bone)) {
    restPos[n] = b.getWorldPosition(new THREE.Vector3());
    restQuat[n] = b.getWorldQuaternion(new THREE.Quaternion());
  }
  const restDir = (a, b) => new THREE.Vector3().subVectors(restPos[b], restPos[a]).normalize();
  // 뼈 이름 → (휴식 방향의 끝점, 목표 방향을 주는 관절 쌍)
  const LIMBS = [
    ["LeftShoulder", "LeftArm"], ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"],
    ["RightShoulder", "RightArm"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"],
    ["LeftUpLeg", "LeftLeg"], ["LeftLeg", "LeftFoot"], ["LeftFoot", "LeftToeBase"],
    ["RightUpLeg", "RightLeg"], ["RightLeg", "RightFoot"], ["RightFoot", "RightToeBase"],
    ["Neck", "Head"],
  ];
  const limbRest = Object.fromEntries(LIMBS.map(([a, b]) => [a, restDir(a, b)]));
  for (const side of ["Left", "Right"]) {
    const tip = handTip(side);
    limbRest[`${side}Hand`] = tip ? new THREE.Vector3().subVectors(tip.getWorldPosition(new THREE.Vector3()), restPos[`${side}Hand`]).normalize() : restDir(`${side}ForeArm`, `${side}Hand`);
  }

  // 중립적인 마네킹 색(피부색 대신 회색 표면 + 짙은 관절)으로 바꾼다
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    const joints = /joint/i.test(o.name) || /joint/i.test(o.material?.name || "");
    o.material = new THREE.MeshStandardMaterial({ color: joints ? 0x3a4148 : 0xc9cdd2, roughness: 0.62, metalness: 0.05 });
  });
  const group = new THREE.Group();
  group.add(root);

  // 작업용 임시 객체
  const v = Array.from({ length: 6 }, () => new THREE.Vector3());
  const q = Array.from({ length: 6 }, () => new THREE.Quaternion());
  const m = new THREE.Matrix4();
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);

  /** 세 축(왼쪽·위·앞)으로 몸통 회전(휴식 기준 → 목표)을 만든다 */
  function basisQuat(left, up, forward, out) {
    m.makeBasis(V(left), V(up), V(forward));
    return out.setFromRotationMatrix(m);
  }

  /** 뼈의 세계 회전을 정한 뒤 부모 기준 로컬 회전으로 바꿔 넣는다 */
  function setWorldQuat(b, worldQ) {
    b.parent.getWorldQuaternion(q[5]).invert();
    b.quaternion.copy(q[5].multiply(worldQ));
    b.updateMatrixWorld(true);
  }

  /** 몸통 회전 delta를 먼저 입힌 휴식 방향을, 목표 방향으로 돌린다 */
  function aim(name, target, bodyDelta) {
    const rest = v[0].copy(limbRest[name]).applyQuaternion(bodyDelta);
    const t = v[1].set(target[0], target[1], target[2]);
    if (t.lengthSq() < 1e-8) return;
    t.normalize();
    q[0].setFromUnitVectors(rest, t);
    q[1].copy(bodyDelta).multiply(restQuat[name]);
    setWorldQuat(bone[name], q[0].multiply(q[1]));
  }

  const hipsDelta = new THREE.Quaternion(), shDelta = new THREE.Quaternion(), headDelta = new THREE.Quaternion();
  const armature = bone.Hips.parent;
  let scale = 1;

  function setPose(lm) {
    // 1) 골반: 위치 + 세 축 회전
    const f = bodyFrame(lm);
    basisQuat(f.left, f.up, f.forward, hipsDelta);
    // 2) 어깨선 기준 몸통 회전 (골반과 다르게 비틀릴 수 있다)
    const shC = mid(lm[J.left_shoulder], lm[J.right_shoulder]);
    let sLeft = normalize(sub(lm[J.left_shoulder], lm[J.right_shoulder]));
    const sUp = f.up;
    sLeft = normalize(sub(sLeft, [sUp[0] * dot(sLeft, sUp), sUp[1] * dot(sLeft, sUp), sUp[2] * dot(sLeft, sUp)]));
    basisQuat(sLeft, sUp, normalize(cross(sLeft, sUp)), shDelta);
    // 3) 머리: 코 방향이 앞, 목 방향이 위
    const earC = mid(lm[J.left_ear], lm[J.right_ear]);
    let hUp = normalize(sub(earC, shC));
    let hFwd = sub(lm[J.nose], earC);
    hFwd = normalize(sub(hFwd, [hUp[0] * dot(hFwd, hUp), hUp[1] * dot(hFwd, hUp), hUp[2] * dot(hFwd, hUp)]));
    if (!Number.isFinite(hFwd[0]) || dist(hFwd, [0, 0, 0]) < 1e-3) hFwd = f.forward;
    basisQuat(normalize(cross(hUp, hFwd)), hUp, hFwd, headDelta);

    // 키 맞추기: 사람의 다리 길이에 모델을 맞춘다 (부드럽게)
    const leg = (dist(lm[J.left_hip], lm[J.left_ankle]) + dist(lm[J.right_hip], lm[J.right_ankle])) / 2;
    const target = Math.max(0.7, Math.min(1.3, leg / MODEL_HIP_TO_ANKLE));
    scale += (target - scale) * 0.2;
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);

    // 골반 위치·회전
    const hipC = f.origin;
    bone.Hips.position.copy(armature.worldToLocal(v[2].set(hipC[0], hipC[1], hipC[2])));
    setWorldQuat(bone.Hips, q[2].copy(hipsDelta).multiply(restQuat.Hips));
    // 척추 3마디: 골반 → 어깨 회전으로 서서히
    for (const [n, k] of [["Spine", 1 / 3], ["Spine1", 2 / 3], ["Spine2", 1]]) {
      q[3].copy(hipsDelta).slerp(shDelta, k);
      setWorldQuat(bone[n], q[3].multiply(restQuat[n]));
    }
    // 목·머리
    aim("Neck", sub(earC, shC), shDelta);
    setWorldQuat(bone.Head, q[4].copy(headDelta).multiply(restQuat.Head));
    // 팔
    for (const [S, sh, el, wr, ix] of [["Left", J.left_shoulder, J.left_elbow, J.left_wrist, J.left_index], ["Right", J.right_shoulder, J.right_elbow, J.right_wrist, J.right_index]]) {
      aim(`${S}Shoulder`, sub(lm[sh], shC), shDelta);
      aim(`${S}Arm`, sub(lm[el], lm[sh]), shDelta);
      aim(`${S}ForeArm`, sub(lm[wr], lm[el]), shDelta);
      aim(`${S}Hand`, sub(lm[ix], lm[wr]), shDelta);
    }
    // 다리
    for (const [S, hp, kn, an, ft] of [["Left", J.left_hip, J.left_knee, J.left_ankle, J.left_foot_index], ["Right", J.right_hip, J.right_knee, J.right_ankle, J.right_foot_index]]) {
      aim(`${S}UpLeg`, sub(lm[kn], lm[hp]), hipsDelta);
      aim(`${S}Leg`, sub(lm[an], lm[kn]), hipsDelta);
      aim(`${S}Foot`, sub(lm[ft], lm[an]), hipsDelta);
    }
  }

  const mats = [];
  root.traverse((o) => { if (o.isMesh) mats.push(o.material); });
  return {
    group,
    setPose,
    setOpacity(o) { for (const mt of mats) { mt.transparent = o < 1; mt.opacity = o; mt.depthWrite = o >= 1; } },
    dispose() { root.traverse((o) => { o.geometry?.dispose(); }); for (const mt of mats) mt.dispose(); },
  };
}
