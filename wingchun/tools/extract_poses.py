#!/usr/bin/env python3
"""1단계: 영상 → 프레임 이미지 + 프레임별 3D 관절 좌표.

사용:
  python3 tools/extract_poses.py 영상.mp4 --work work --fps 15

결과(work/ 아래):
  frames/000123.jpg          잘라 저장한 프레임 (프레임 번호 = 원본 영상 기준)
  frames_pose/000123.jpg     관절을 그려 넣은 프레임 (인식이 잘 됐는지 눈으로 확인용)
  landmarks.json             {fps, video, frames:[{t, index, lm:[[x,y,z]×33], vis:[…]}]}
  holds.json                 자동으로 찾은 정지 구간(자세 후보)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from pose_common import (
    BONES, ensure_model, fill_gaps, log, make_landmarker, save_json, segment_holds,
    smooth_frames, visibilities, world_to_viewer,
)


def draw_pose(img, norm_landmarks):
    h, w = img.shape[:2]
    pts = [(int(l.x * w), int(l.y * h)) for l in norm_landmarks]
    for a, b in BONES:
        cv2.line(img, pts[a], pts[b], (60, 220, 120), 2, cv2.LINE_AA)
    for i, p in enumerate(pts):
        color = (255, 170, 40) if i % 2 == 1 else (40, 170, 255)  # 왼쪽 홀수=주황, 오른쪽=파랑
        if i == 0:
            color = (255, 255, 255)
        cv2.circle(img, p, 4, color, -1, cv2.LINE_AA)
    return img


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", help="입력 영상 (mp4/mov 등 OpenCV가 읽는 형식)")
    ap.add_argument("--work", default="work", help="작업 폴더 (기본 work)")
    ap.add_argument("--fps", type=float, default=15, help="추출 프레임/초 (기본 15)")
    ap.add_argument("--model", default=None, help="pose_landmarker .task 경로 (없으면 자동 다운로드)")
    ap.add_argument("--smooth", type=int, default=2, help="관절 떨림 완화 반경 (0=끔)")
    ap.add_argument("--max-side", type=int, default=960, help="긴 변을 이 픽셀로 줄여 인식 (속도)")
    ap.add_argument("--hold-speed", type=float, default=None, help="자세 판정 속도 임계값 m/s (기본: 영상 속도 분포에서 자동)")
    ap.add_argument("--hold-min", type=float, default=0.35, help="자세로 인정할 최소 정지 시간(초)")
    ap.add_argument("--no-frames", action="store_true", help="프레임 이미지를 저장하지 않음")
    args = ap.parse_args()

    work = Path(args.work)
    (work / "frames").mkdir(parents=True, exist_ok=True)
    (work / "frames_pose").mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"영상을 열 수 없습니다: {args.video}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(round(src_fps / args.fps)))
    log(f"[video] {args.video}: {src_fps:.2f}fps, {total}프레임, {total / src_fps:.1f}초 → {step}프레임마다 추출")

    model = ensure_model(args.model)
    landmarker = make_landmarker(model, "video")

    import mediapipe as mp

    frames = []
    index = -1
    detected = 0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        index += 1
        if index % step:
            continue
        t = index / src_fps
        h, w = bgr.shape[:2]
        scale = min(1.0, args.max_side / max(h, w))
        small = cv2.resize(bgr, (int(w * scale), int(h * scale))) if scale < 1 else bgr
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        res = landmarker.detect_for_video(mp_img, int(t * 1000))
        rec = {"t": round(t, 3), "index": index, "lm": None, "vis": None}
        if res.pose_world_landmarks:
            rec["lm"] = world_to_viewer(res.pose_world_landmarks[0])
            rec["vis"] = visibilities(res.pose_world_landmarks[0])
            detected += 1
            if not args.no_frames:
                cv2.imwrite(str(work / "frames_pose" / f"{index:06d}.jpg"), draw_pose(small.copy(), res.pose_landmarks[0]))
        if not args.no_frames:
            cv2.imwrite(str(work / "frames" / f"{index:06d}.jpg"), small)
        frames.append(rec)
        if len(frames) % 50 == 0:
            log(f"  {t:6.1f}s  프레임 {len(frames)}  인식 {detected}")
    cap.release()
    landmarker.close()

    if not frames:
        raise SystemExit("프레임을 하나도 읽지 못했습니다.")
    log(f"[pose] {len(frames)}프레임 중 {detected}프레임 인식 ({detected / len(frames) * 100:.0f}%)")
    if detected == 0:
        raise SystemExit("사람을 인식하지 못했습니다. 전신이 나오는 영상인지 확인하세요.")

    fill_gaps(frames)
    if args.smooth > 0:
        smooth_frames(frames, args.smooth)

    holds = segment_holds(frames, args.hold_speed, args.hold_min)
    log(f"[holds] 정지 구간 {len(holds)}개:")
    for i, h in enumerate(holds):
        log(f"   {i + 1:2d}. {h['start']:6.2f}s ~ {h['end']:6.2f}s  (대표 {h['key']:.2f}s)")

    save_json(work / "landmarks.json", {
        "video": str(args.video), "srcFps": src_fps, "fps": args.fps, "frames": frames,
    })
    save_json(work / "holds.json", holds)
    log(f"[done] {work / 'landmarks.json'} , {work / 'holds.json'}")
    log("다음: python3 tools/match_book.py --work work --book book --poses poses.json")


if __name__ == "__main__":
    main()
