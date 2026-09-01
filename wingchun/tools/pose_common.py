"""영춘권 가이드 파이프라인 공용 코드.

좌표계: MediaPipe world landmark(x 오른쪽, y 아래, z 카메라 반대)를
뷰어 규약(x = 본인의 왼쪽, y = 위, z = 본인의 앞)으로 바꿔 저장한다.
MediaPipe 세계 좌표는 이미 골반 중심이 원점이고 단위는 m.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)
DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "pose_landmarker_heavy.task"

JOINTS = [
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
]
J = {n: i for i, n in enumerate(JOINTS)}
MOTION_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

BONES = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (15, 17), (15, 19), (15, 21), (17, 19), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
    (27, 29), (27, 31), (29, 31), (28, 30), (28, 32), (30, 32),
]


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def ensure_model(path: Path | None = None) -> Path:
    """포즈 모델(.task) 파일이 없으면 내려받는다 (약 30MB)."""
    path = Path(path) if path else DEFAULT_MODEL
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log(f"[model] 내려받는 중: {MODEL_URL}")
    urllib.request.urlretrieve(MODEL_URL, path)
    log(f"[model] 저장: {path} ({path.stat().st_size // 1_000_000}MB)")
    return path


def make_landmarker(model_path: Path, mode: str):
    """mode: 'image' | 'video'"""
    from mediapipe.tasks.python import BaseOptions, vision

    running = vision.RunningMode.IMAGE if mode == "image" else vision.RunningMode.VIDEO
    opts = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path)),
        running_mode=running,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )
    return vision.PoseLandmarker.create_from_options(opts)


def world_to_viewer(world_landmarks) -> list[list[float]]:
    """MediaPipe world landmark → 뷰어 좌표 [x, y, z] (소수 3자리)."""
    out = []
    for l in world_landmarks:
        out.append([round(float(l.x), 3), round(-float(l.y), 3), round(-float(l.z), 3)])
    return out


def visibilities(world_landmarks) -> list[float]:
    return [round(float(getattr(l, "visibility", 1.0) or 0.0), 2) for l in world_landmarks]


def to_array(lm) -> np.ndarray:
    return np.asarray(lm, dtype=np.float64)


# ---------- 다듬기 / 분할 ----------

def fill_gaps(frames: list[dict]) -> list[dict]:
    """인식 실패 프레임(lm=None)을 앞뒤 프레임으로 보간해 채운다."""
    idx = [i for i, f in enumerate(frames) if f["lm"] is not None]
    if not idx:
        return frames
    first, last = idx[0], idx[-1]
    for i in range(0, first):
        frames[i]["lm"] = frames[first]["lm"]
        frames[i]["filled"] = True
    for i in range(last + 1, len(frames)):
        frames[i]["lm"] = frames[last]["lm"]
        frames[i]["filled"] = True
    for a, b in zip(idx, idx[1:]):
        if b - a <= 1:
            continue
        la, lb = to_array(frames[a]["lm"]), to_array(frames[b]["lm"])
        for i in range(a + 1, b):
            k = (i - a) / (b - a)
            frames[i]["lm"] = np.round(la + (lb - la) * k, 3).tolist()
            frames[i]["filled"] = True
    return frames


def smooth_frames(frames: list[dict], radius: int = 2) -> list[dict]:
    """관절 떨림을 줄이는 이동 평균 (창 = 2*radius+1)."""
    arr = np.stack([to_array(f["lm"]) for f in frames])  # (N, 33, 3)
    n = len(frames)
    out = np.empty_like(arr)
    for i in range(n):
        a, b = max(0, i - radius), min(n, i + radius + 1)
        out[i] = arr[a:b].mean(axis=0)
    for i, f in enumerate(frames):
        f["lm"] = np.round(out[i], 3).tolist()
    return frames


def speeds(frames: list[dict], min_vis: float = 0.5, top: int = 3) -> np.ndarray:
    """프레임마다 몸 움직임 속도(m/s).

    큰 관절 중 카메라에 보이는 것(visibility ≥ min_vis)만 쓰고, 그중 빠른 top개의 평균.
    한 팔만 움직여도 잡히고(평균이 아니라 상위), 안 보이는 관절의 떨림에는 흔들리지 않게.
    """
    arr = np.stack([to_array(f["lm"])[MOTION_JOINTS] for f in frames])
    vis = np.stack([
        (np.asarray(f["vis"], dtype=float)[MOTION_JOINTS] if f.get("vis") else np.ones(len(MOTION_JOINTS)))
        for f in frames
    ])
    t = np.array([f["t"] for f in frames])
    v = np.zeros(len(frames))
    for i in range(1, len(frames)):
        dt = t[i] - t[i - 1]
        if dt <= 0:
            continue
        ok = (vis[i] >= min_vis) & (vis[i - 1] >= min_vis)
        if ok.sum() < 2:
            ok = np.ones(len(MOTION_JOINTS), bool)
        s = np.sort(np.linalg.norm(arr[i][ok] - arr[i - 1][ok], axis=1))[::-1]
        v[i] = s[:top].mean() / dt
    if len(v) > 1:
        v[0] = v[1]
    return v


def moving_avg(v: np.ndarray, radius: int = 2) -> np.ndarray:
    out = np.empty_like(v)
    for i in range(len(v)):
        a, b = max(0, i - radius), min(len(v), i + radius + 1)
        out[i] = v[a:b].mean()
    return out


def segment_holds(frames: list[dict], speed_threshold=None, min_hold=0.35, smooth_radius=2,
                  ratio=0.1, min_speed=0.06) -> list[dict]:
    """멈춰 있는 구간(자세)을 찾는다. src/sequence.js의 segmentHolds와 같은 알고리즘.

    speed_threshold 가 None 이면 영상 자체의 속도 분포로 정한다: max(min_speed, ratio × 95분위).
    """
    if len(frames) < 2:
        return []
    sp = moving_avg(speeds(frames), smooth_radius)
    if speed_threshold is None:
        s = np.sort(sp)
        p95 = s[min(len(s) - 1, max(0, int(round((len(s) - 1) * 0.95))))]
        speed_threshold = max(min_speed, ratio * p95)
    log(f"[holds] 속도 임계값 {speed_threshold:.3f} m/s")
    holds = []
    run_start = -1

    def flush(end_idx):
        nonlocal run_start
        if run_start < 0:
            return
        start, end = frames[run_start]["t"], frames[end_idx]["t"]
        if end - start >= min_hold:
            best = run_start + int(np.argmin(sp[run_start:end_idx + 1]))
            holds.append({
                "start": round(start, 3), "end": round(end, 3), "key": round(frames[best]["t"], 3),
                "startIndex": run_start, "endIndex": end_idx, "keyIndex": best,
            })
        run_start = -1

    for i in range(len(frames)):
        if sp[i] < speed_threshold:
            if run_start < 0:
                run_start = i
        else:
            flush(i - 1)
    flush(len(frames) - 1)
    return holds


# ---------- 자세 비교 ----------

def body_frame(lm: np.ndarray):
    hip_c = (lm[J["left_hip"]] + lm[J["right_hip"]]) / 2
    sh_c = (lm[J["left_shoulder"]] + lm[J["right_shoulder"]]) / 2
    up = sh_c - hip_c
    torso = np.linalg.norm(up) or 1.0
    up = up / torso
    left = lm[J["left_hip"]] - lm[J["right_hip"]]
    left = left - up * np.dot(left, up)
    left = left / (np.linalg.norm(left) or 1.0)
    forward = np.cross(left, up)
    return hip_c, left, up, forward, torso


def normalize_pose(lm) -> np.ndarray:
    lm = to_array(lm)
    origin, left, up, forward, torso = body_frame(lm)
    d = lm - origin
    return np.stack([d @ left, d @ up, d @ forward], axis=1) / torso


def pose_distance(a, b, joints=MOTION_JOINTS) -> float:
    na, nb = normalize_pose(a)[joints], normalize_pose(b)[joints]
    return float(np.linalg.norm(na - nb, axis=1).mean())


def assign_refs_to_holds(ref_lms: list, hold_lms: list) -> list[int]:
    """책 자세들을 정지 구간에 순서를 지키며(단조) 배정. src/sequence.js의 assignRefsToHolds와 동일."""
    n, m = len(ref_lms), len(hold_lms)
    if not n or not m:
        return [-1] * n
    INF = 1e9
    cost = [[pose_distance(r, h) for h in hold_lms] for r in ref_lms]
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    choice = [[-1] * (m + 1) for _ in range(n + 1)]
    for j in range(m + 1):
        dp[0][j] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if dp[i][j - 1] < dp[i][j]:
                dp[i][j], choice[i][j] = dp[i][j - 1], choice[i][j - 1]
            c = dp[i - 1][j - 1] + cost[i - 1][j - 1]
            if c < dp[i][j]:
                dp[i][j], choice[i][j] = c, j - 1
    out = [-1] * n
    j = m
    for i in range(n, 0, -1):
        h = choice[i][j]
        if h < 0:
            break
        out[i - 1] = h
        j = h
    return out


# ---------- 출력 ----------

def write_sequence_js(path: Path, seq: dict):
    """뷰어가 import하는 ESM 데이터 파일을 쓴다 (fetch 없이 file://에서도 동작)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(seq, ensure_ascii=False, separators=(",", ":"))
    header = (
        "// 자동 생성 파일 — wingchun/tools 파이프라인이 만든다. 손으로 고치지 말 것.\n"
        "// 좌표: 원점 골반 중심, +x 본인의 왼쪽, +y 위, +z 본인의 앞. 단위 m.\n"
    )
    path.write_text(header + "export const sequence = " + body + ";\n", encoding="utf-8")
    log(f"[write] {path} ({path.stat().st_size // 1024}KB, frames={len(seq['frames'])}, poses={len(seq['poses'])})")


def load_json(path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
