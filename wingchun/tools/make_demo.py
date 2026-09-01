#!/usr/bin/env python3
"""데모 데이터 생성 — 실제 영상을 처리하기 전에 뷰어가 돌아가도록 소념두(小念頭) 1단 앞부분을
손으로 만든 핵심 자세 사이를 보간해 만든다. 파이프라인 출력과 같은 형식.

  python3 tools/make_demo.py                         # → data/demo.js (테스트용)
  python3 tools/make_demo.py --out data/sequence.js  # 뷰어에서 데모 보기
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from pose_common import J, write_sequence_js

FPS = 15
HOLD = 0.9      # 자세 유지 초
MOVE = 0.7      # 전환 초


def mirror(p):
    return np.array([-p[0], p[1], p[2]])


def hand_points(wrist, direction, side):
    """손목·손 방향·손 옆 방향으로 검지/새끼/엄지 위치를 만든다 (모양용)."""
    d = np.asarray(direction, float)
    d /= np.linalg.norm(d) or 1
    s = np.asarray(side, float)
    s -= d * np.dot(s, d)
    s /= np.linalg.norm(s) or 1
    index = wrist + d * 0.085 + s * 0.012
    pinky = wrist + d * 0.075 - s * 0.022
    thumb = wrist + d * 0.04 + s * 0.04
    return index, pinky, thumb


def base_body(stance):
    """머리·몸통·다리. stance: 'closed' | 'kim_yeung_ma'"""
    P = np.zeros((33, 3))
    P[J["left_hip"]] = [0.11, 0.0, 0.0]
    P[J["right_hip"]] = [-0.11, 0.0, 0.0]
    P[J["left_shoulder"]] = [0.19, 0.48, 0.0]
    P[J["right_shoulder"]] = [-0.19, 0.48, 0.0]
    P[J["nose"]] = [0.0, 0.66, 0.09]
    P[J["left_eye_inner"]] = [0.02, 0.69, 0.075]
    P[J["left_eye"]] = [0.035, 0.69, 0.07]
    P[J["left_eye_outer"]] = [0.05, 0.69, 0.06]
    for n in ("eye_inner", "eye", "eye_outer"):
        P[J["right_" + n]] = mirror(P[J["left_" + n]])
    P[J["left_ear"]] = [0.08, 0.665, -0.01]
    P[J["right_ear"]] = mirror(P[J["left_ear"]])
    P[J["mouth_left"]] = [0.022, 0.62, 0.075]
    P[J["mouth_right"]] = mirror(P[J["mouth_left"]])
    if stance == "closed":
        L = {"knee": [0.09, -0.45, 0.01], "ankle": [0.08, -0.88, 0.0], "heel": [0.08, -0.92, -0.04], "foot_index": [0.08, -0.91, 0.13]}
    else:  # 이자겸양마: 발을 어깨너비보다 조금 넓게, 발끝은 안쪽, 무릎은 안으로 모아 살짝 굽힘
        L = {"knee": [0.13, -0.42, 0.07], "ankle": [0.21, -0.85, 0.0], "heel": [0.22, -0.89, -0.05], "foot_index": [0.15, -0.88, 0.12]}
    for k, v in L.items():
        P[J["left_" + k]] = v
        P[J["right_" + k]] = mirror(np.array(v))
    return P


def arm(P, side, elbow, wrist, direction, palm_side):
    """side: 'left'|'right'. 오른팔 값은 왼팔 좌표를 그대로 넣으면 거울로 놓는다."""
    e, w = np.array(elbow, float), np.array(wrist, float)
    d, s = np.array(direction, float), np.array(palm_side, float)
    if side == "right":
        e, w, d, s = mirror(e), mirror(w), mirror(d), mirror(s)
    P[J[f"{side}_elbow"]] = e
    P[J[f"{side}_wrist"]] = w
    i, p, t = hand_points(w, d, s)
    P[J[f"{side}_index"]] = i
    P[J[f"{side}_pinky"]] = p
    P[J[f"{side}_thumb"]] = t


# 팔 자세 사전 (왼팔 기준 좌표; 오른팔은 거울)
ARMS = {
    "down":     dict(elbow=[0.22, 0.20, 0.00], wrist=[0.23, -0.05, 0.02], direction=[0, -1, 0.1], palm_side=[0, 0, 1]),
    "chamber":  dict(elbow=[0.25, 0.25, -0.10], wrist=[0.17, 0.30, 0.03], direction=[-0.3, 0, 1], palm_side=[0, 1, 0]),
    "gan_x":    dict(elbow=[0.10, 0.22, 0.20], wrist=[-0.05, 0.02, 0.37], direction=[-0.4, -0.5, 0.6], palm_side=[1, 0, 0]),   # 교차저수(왼손 위)
    "gan_x_r":  dict(elbow=[0.10, 0.22, 0.19], wrist=[-0.05, 0.03, 0.34], direction=[-0.4, -0.5, 0.6], palm_side=[1, 0, 0]),
    "tan_x":    dict(elbow=[0.08, 0.36, 0.22], wrist=[-0.06, 0.40, 0.43], direction=[-0.5, 0.15, 0.8], palm_side=[1, 0, 0]),   # 교차탄수
    "tan_x_r":  dict(elbow=[0.08, 0.36, 0.21], wrist=[-0.06, 0.41, 0.40], direction=[-0.5, 0.15, 0.8], palm_side=[1, 0, 0]),
    "tan":      dict(elbow=[0.07, 0.34, 0.21], wrist=[0.00, 0.40, 0.43], direction=[-0.2, 0.15, 1], palm_side=[1, 0, 0]),      # 탄수
    "wu":       dict(elbow=[0.08, 0.31, 0.15], wrist=[0.00, 0.46, 0.27], direction=[0, 1, 0.25], palm_side=[1, 0, 0]),         # 호수
    "fook":     dict(elbow=[0.06, 0.33, 0.21], wrist=[0.00, 0.40, 0.42], direction=[-0.1, -0.75, 0.65], palm_side=[1, 0, 0]),  # 복수
    "side_palm": dict(elbow=[0.09, 0.36, 0.22], wrist=[-0.02, 0.43, 0.49], direction=[-0.8, 0.2, 0.55], palm_side=[0, 1, 0]), # 측장
    "palm":     dict(elbow=[0.05, 0.40, 0.31], wrist=[0.00, 0.44, 0.56], direction=[0, 1, 0.3], palm_side=[1, 0, 0]),         # 정장
}


def pose(stance, left, right):
    P = base_body(stance)
    arm(P, "left", **ARMS[left])
    arm(P, "right", **ARMS[right])
    return P


# (id, 이름, 한자, stance, 왼팔, 오른팔, 설명, 요령, 전환 요령)
KEYS = [
    ("p01", "예비세", "預備勢", "closed", "down", "down",
     "발을 모으고 바르게 선다. 팔은 자연스럽게 내리고 시선은 정면.",
     ["정수리를 위로 끌어올리듯 목을 세운다", "어깨 힘을 뺀다"], ""),
    ("p02", "이자겸양마", "二字鉗羊馬", "kim_yeung_ma", "chamber", "chamber",
     "발끝을 벌렸다 뒤꿈치를 벌려 '八'자 모양 기마를 만든다. 무릎을 안쪽으로 모으듯 살짝 굽히고 두 주먹은 가슴 옆에 당긴다.",
     ["무릎이 발끝보다 앞으로 나가지 않게", "주먹은 가슴 옆, 팔꿈치는 뒤로"], "발끝 → 뒤꿈치 순서로 벌리며 무릎을 살짝 굽힌다"),
    ("p03", "교차저수", "交叉低手", "kim_yeung_ma", "gan_x", "gan_x_r",
     "두 팔을 아래로 뻗어 손목을 교차한다. 왼손이 위. 팔꿈치는 거의 펴되 완전히 잠그지 않는다.",
     ["손목은 배꼽 높이보다 조금 아래", "어깨가 올라가지 않게"], "주먹을 펴며 두 팔을 아래로 미끄러뜨려 교차"),
    ("p04", "교차탄수", "交叉攤手", "kim_yeung_ma", "tan_x", "tan_x_r",
     "교차한 팔을 그대로 가슴 높이로 들어 손바닥이 위를 향하게 한다.",
     ["팔꿈치를 중심선 쪽으로", "손바닥은 하늘"], "팔꿈치를 굽히지 말고 어깨에서 들어올린다"),
    ("p05", "수권", "收拳", "kim_yeung_ma", "chamber", "chamber",
     "손을 주먹으로 쥐며 팔꿈치를 뒤로 당겨 가슴 옆으로 되돌린다.",
     ["팔꿈치가 팔을 이끈다", "주먹이 몸통을 스치듯"], "손목을 돌려 주먹을 쥐고 팔꿈치부터 뒤로"),
    ("p06", "좌 탄수", "左攤手", "kim_yeung_ma", "tan", "chamber",
     "왼손을 손바닥이 위로 오게 펴서 중심선을 따라 천천히 밀어낸다. 팔꿈치는 중심선에서 주먹 하나 반 거리.",
     ["최대한 천천히", "팔꿈치가 옆으로 벌어지지 않게", "손목 높이는 가슴"], "주먹을 펴고 팔꿈치를 중심선에 붙인 채 앞으로"),
    ("p07", "좌 호수", "左護手", "kim_yeung_ma", "wu", "chamber",
     "손을 세워(손가락 위) 중심선 위에서 몸 쪽으로 당겨 보호 자세를 만든다.",
     ["손끝은 코 높이", "팔꿈치는 아래로 떨어뜨린다"], "탄수에서 손목을 돌려(권수) 손을 세우며 당긴다"),
    ("p08", "좌 복수", "左伏手", "kim_yeung_ma", "fook", "chamber",
     "손목을 굽혀 손을 아래로 덮듯 하고 팔꿈치를 중심선에 붙인 채 천천히 밀어낸다. 세 번 반복한다.",
     ["손목은 굽히되 힘은 팔꿈치에", "어깨는 내린다"], "호수에서 손목을 꺾어 손등이 앞을 보게 하며 앞으로"),
    ("p09", "좌 측장", "左側掌", "kim_yeung_ma", "side_palm", "chamber",
     "손바닥을 옆으로 세워 중심선 위에서 짧게 친다.",
     ["손바닥 날이 상대를 향한다", "몸은 흔들리지 않는다"], "복수에서 손목을 돌려 손바닥 날을 앞으로"),
    ("p10", "좌 정장", "左正掌", "kim_yeung_ma", "palm", "chamber",
     "손바닥을 정면으로 세워 중심선을 따라 뻗는다. 팔꿈치가 거의 펴질 때까지.",
     ["손목을 세운다", "어깨가 따라 나가지 않게"], "측장에서 손을 세워 정면 손바닥으로 밀어 뻗는다"),
    ("p11", "좌 수권", "左收拳", "kim_yeung_ma", "chamber", "chamber",
     "손목을 돌려(권수) 주먹을 쥐고 팔꿈치를 당겨 가슴 옆으로 되돌린다.",
     ["팔꿈치가 이끈다"], "정장 → 손목 돌리기 → 주먹 → 당기기"),
    ("p12", "우 탄수", "右攤手", "kim_yeung_ma", "chamber", "tan",
     "오른손으로 탄수. 왼쪽과 같은 요령.", ["최대한 천천히", "팔꿈치를 중심선에"], "주먹을 펴고 팔꿈치부터 앞으로"),
    ("p13", "우 호수", "右護手", "kim_yeung_ma", "chamber", "wu",
     "오른손 호수.", ["손끝은 코 높이"], "손목을 돌려 손을 세우며 당긴다"),
    ("p14", "우 복수", "右伏手", "kim_yeung_ma", "chamber", "fook",
     "오른손 복수. 세 번 반복.", ["팔꿈치가 중심선"], "손목을 꺾어 앞으로"),
    ("p15", "우 측장", "右側掌", "kim_yeung_ma", "chamber", "side_palm",
     "오른손 측장.", ["손바닥 날"], "손목을 돌려 손바닥 날을 앞으로"),
    ("p16", "우 정장", "右正掌", "kim_yeung_ma", "chamber", "palm",
     "오른손 정장.", ["손목을 세운다"], "손을 세워 정면으로 뻗는다"),
    ("p17", "우 수권", "右收拳", "kim_yeung_ma", "chamber", "chamber",
     "주먹을 쥐고 가슴 옆으로 되돌린다.", ["팔꿈치가 이끈다"], "손목 돌리기 → 주먹 → 당기기"),
]


def ease(k):
    return 0.5 - 0.5 * np.cos(np.pi * k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "demo.js"))
    args = ap.parse_args()

    key_poses = [pose(s, l, r) for (_, _, _, s, l, r, *_rest) in KEYS]
    frames, poses = [], []
    t = 0.0
    dt = 1 / FPS
    for i, (pid, name, zh, _s, _l, _r, desc, cues, trans) in enumerate(KEYS):
        P = key_poses[i]
        start = t
        n_hold = int(round(HOLD * FPS))
        for _ in range(n_hold):
            frames.append({"t": round(t, 3), "lm": np.round(P, 3).tolist()})
            t += dt
        end = t - dt
        poses.append({
            "id": pid, "name": name, "zh": zh, "desc": desc, "cues": cues, "transition": trans,
            "image": None, "ref": np.round(P, 3).tolist(),
            "start": round(start, 3), "end": round(end, 3), "key": round((start + end) / 2, 3),
        })
        if i + 1 < len(KEYS):
            Q = key_poses[i + 1]
            n_move = int(round(MOVE * FPS))
            for k in range(1, n_move + 1):
                a = ease(k / (n_move + 1))
                frames.append({"t": round(t, 3), "lm": np.round(P + (Q - P) * a, 3).tolist()})
                t += dt

    seq = {
        "title": "소념두 (小念頭) 1단 — 데모 (손으로 만든 예시)",
        "subtitle": "예시 데이터입니다. 본인 영상과 책 사진으로 tools/ 파이프라인을 돌리면 이 파일이 교체됩니다.",
        "fps": FPS,
        "generated": "demo",
        "source": "make_demo.py",
        "frames": frames,
        "poses": poses,
    }
    write_sequence_js(Path(args.out), seq)


if __name__ == "__main__":
    main()
