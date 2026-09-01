#!/usr/bin/env python3
"""영상 없이 책 사진만으로 뷰어 데이터 만들기.

책 사진 각각에서 3D 자세를 인식하고, 자세 사이를 부드럽게 보간해 연속동작처럼 만든다.
영상이 준비되기 전에 자세 이름·책 사진·각도를 먼저 볼 수 있고, 영상이 오면
extract_poses → match_book → build_sequence 로 교체하면 된다.

  python3 tools/book_only.py --poses poses.json --book book --out data/sequence.js --title "영춘권 기본동작(1)"
"""
from __future__ import annotations

import argparse
import shutil
from datetime import date
from pathlib import Path

import numpy as np

from pose_common import ensure_model, load_json, log, make_landmarker, world_to_viewer, write_sequence_js


def detect_image(landmarker, path: Path):
    import mediapipe as mp

    res = landmarker.detect(mp.Image.create_from_file(str(path)))
    return world_to_viewer(res.pose_world_landmarks[0]) if res.pose_world_landmarks else None


def ease(k: float) -> float:
    return 0.5 - 0.5 * float(np.cos(np.pi * k))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--poses", default="poses.json", help="자세 목록 JSON (image 경로 포함)")
    ap.add_argument("--book", default="book", help="사진 폴더 (poses.json의 image가 상대 경로일 때 기준)")
    ap.add_argument("--out", default="data/sequence.js")
    ap.add_argument("--title", default="영춘권 기본동작")
    ap.add_argument("--subtitle", default="책 사진에서 인식한 자세를 보간한 데이터 (영상 처리 전)")
    ap.add_argument("--fps", type=int, default=15)
    ap.add_argument("--hold", type=float, default=1.0, help="자세 유지 초")
    ap.add_argument("--move", type=float, default=0.8, help="전환 초")
    ap.add_argument("--model", default=None)
    args = ap.parse_args()

    poses_in = load_json(args.poses)
    out_path = Path(args.out).resolve()
    app_dir = out_path.parent.parent  # data/ 의 부모 = wingchun/
    book_dst = app_dir / "book"
    landmarker = make_landmarker(ensure_model(args.model), "image")

    poses, refs = [], []
    for i, p in enumerate(poses_in):
        img = p.get("image")
        src = None
        if img:
            src = Path(img)
            if not src.exists():
                src = Path(args.book) / Path(img).name
        ref = detect_image(landmarker, src) if src and src.exists() else None
        log(f"   {p.get('id', i + 1)} {p.get('name', ''):<12} {'인식' if ref else '인식 실패 — 건너뜀'}")
        if ref is None:
            continue
        if src and src.exists():
            book_dst.mkdir(parents=True, exist_ok=True)
            dst = book_dst / src.name
            if src.resolve() != dst.resolve():
                shutil.copy2(src, dst)
            img = f"book/{src.name}"
        poses.append({
            "id": p.get("id") or f"p{i + 1:02d}", "name": p.get("name") or f"자세 {i + 1}", "zh": p.get("zh", ""),
            "desc": p.get("desc", ""), "cues": p.get("cues", []), "transition": p.get("transition", ""),
            "image": img, "ref": ref,
        })
        refs.append(np.asarray(ref))
    landmarker.close()
    if not poses:
        raise SystemExit("인식된 자세가 없습니다.")

    frames, t, dt = [], 0.0, 1 / args.fps
    n_hold, n_move = int(round(args.hold * args.fps)), int(round(args.move * args.fps))
    for i, P in enumerate(refs):
        start = t
        for _ in range(n_hold):
            frames.append({"t": round(t, 3), "lm": np.round(P, 3).tolist()})
            t += dt
        end = t - dt
        poses[i].update(start=round(start, 3), end=round(end, 3), key=round((start + end) / 2, 3))
        if i + 1 < len(refs):
            Q = refs[i + 1]
            for k in range(1, n_move + 1):
                a = ease(k / (n_move + 1))
                frames.append({"t": round(t, 3), "lm": np.round(P + (Q - P) * a, 3).tolist()})
                t += dt

    write_sequence_js(out_path, {
        "title": args.title, "subtitle": args.subtitle, "fps": args.fps, "generated": str(date.today()),
        "source": "book_only.py", "frames": frames, "poses": poses,
    })


if __name__ == "__main__":
    main()
