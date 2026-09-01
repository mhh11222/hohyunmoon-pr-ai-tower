// 인체 골격 정의 — MediaPipe Pose 33개 랜드마크 규약을 그대로 쓴다.
// 좌표계(데이터 파일 기준): 원점 = 골반 중심, +y 위, +x 본인의 왼쪽, +z 본인의 앞(카메라 쪽). 단위 m.

export const JOINTS = [
  "nose",
  "left_eye_inner", "left_eye", "left_eye_outer",
  "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear",
  "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_pinky", "right_pinky",
  "left_index", "right_index",
  "left_thumb", "right_thumb",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
  "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
];

/** 이름 → 인덱스 */
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));

/** 한국어 관절 이름 */
export const JOINT_KO = {
  nose: "코", left_ear: "왼귀", right_ear: "오른귀",
  left_shoulder: "왼어깨", right_shoulder: "오른어깨",
  left_elbow: "왼팔꿈치", right_elbow: "오른팔꿈치",
  left_wrist: "왼손목", right_wrist: "오른손목",
  left_index: "왼검지", right_index: "오른검지",
  left_hip: "왼고관절", right_hip: "오른고관절",
  left_knee: "왼무릎", right_knee: "오른무릎",
  left_ankle: "왼발목", right_ankle: "오른발목",
  left_foot_index: "왼발끝", right_foot_index: "오른발끝",
};

/** 뼈대 연결 (MediaPipe POSE_CONNECTIONS에서 얼굴 세부 연결은 뺐다) */
export const BONES = [
  [11, 12],               // 어깨선
  [11, 13], [13, 15],     // 왼팔
  [12, 14], [14, 16],     // 오른팔
  [15, 17], [15, 19], [15, 21], [17, 19], // 왼손
  [16, 18], [16, 20], [16, 22], [18, 20], // 오른손
  [11, 23], [12, 24], [23, 24], // 몸통
  [23, 25], [25, 27],     // 왼다리
  [24, 26], [26, 28],     // 오른다리
  [27, 29], [27, 31], [29, 31], // 왼발
  [28, 30], [28, 32], [30, 32], // 오른발
];

/** 관절이 왼쪽/오른쪽/중앙 중 어디 소속인지 (색 구분용) */
export function sideOf(index) {
  const name = JOINTS[index];
  if (name.startsWith("left_") || name === "mouth_left") return "left";
  if (name.startsWith("right_") || name === "mouth_right") return "right";
  return "center";
}

/** 움직임 속도 계산에 쓰는 "큰 관절" — 얼굴·손끝처럼 떨리는 점은 뺀다 */
export const MOTION_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
