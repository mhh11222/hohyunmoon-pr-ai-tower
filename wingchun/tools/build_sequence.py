#!/usr/bin/env python3
"""3단계: landmarks.json + poses.json → 뷰어 데이터(data/sequence.js) + 책 사진 복사.

사용:
  python3 tools/build_sequence.py --work work --out data/sequence.js --title "소념두 1단" [--book book]

poses.json 에 start/end/key 가 비어 있는 자세는 자동 분할 구간을 순서대로 채우고,
그래도 없으면 뷰어에서 "구간 미지정"으로 표시된다.
"""
from __future__ import annotations

import argparse
import shutil
from datetime import date
from pathlib import Path

from pose_common import load_json, log, segment_holds, write_sequence_js


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default="work")
    ap.add_argument("--out", default="data/sequence.js")
    ap.add_argument("--title", default="영춘권 기본 연속동작")
    ap.add_argument("--subtitle", default="")
    ap.add_argument("--book", default="book", help="책 사진 원본 폴더 (뷰어의 book/ 으로 복사)")
    ap.add_argument("--poses", default=None, help="work/poses.json 대신 쓸 파일")
    args = ap.parse_args()

    work = Path(args.work)
    lmk = load_json(work / "landmarks.json")
    frames = [{"t": f["t"], "lm": f["lm"]} for f in lmk["frames"] if f["lm"] is not None]
    poses_in = load_json(args.poses or work / "poses.json")

    holds = segment_holds(frames)
    used = {p.get("holdIndex", -1) for p in poses_in}
    free = [i for i in range(len(holds)) if i not in used]

    out_dir = Path(args.out).resolve().parent.parent  # data/ 의 부모 = wingchun/
    book_dst = out_dir / "book"
    poses = []
    for i, p in enumerate(poses_in):
        q = {
            "id": p.get("id") or f"p{i + 1:02d}",
            "name": p.get("name") or f"자세 {i + 1}",
            "zh": p.get("zh", ""),
            "desc": p.get("desc", ""),
            "cues": p.get("cues", []),
            "transition": p.get("transition", ""),
            "image": p.get("image"),
            "ref": p.get("ref"),
            "start": p.get("start"), "end": p.get("end"), "key": p.get("key"),
        }
        if q["start"] is None:
            if free:
                h = holds[free.pop(0)]
                q["start"], q["end"], q["key"] = h["start"], h["end"], h["key"]
                log(f"[fill] {q['id']} {q['name']}: 남는 정지 구간 {h['start']:.2f}~{h['end']:.2f}s 배정")
            else:
                log(f"[warn] {q['id']} {q['name']}: 영상 구간이 없습니다 (poses.json에 start/end/key를 직접 적으세요)")
        # 책 사진 복사
        if q["image"]:
            src = Path(q["image"])
            if not src.exists():
                src = Path(args.book) / Path(q["image"]).name
            if src.exists():
                book_dst.mkdir(parents=True, exist_ok=True)
                dst = book_dst / src.name
                if src.resolve() != dst.resolve():
                    shutil.copy2(src, dst)
                q["image"] = f"book/{src.name}"
            else:
                log(f"[warn] 사진을 찾을 수 없음: {q['image']}")
        poses.append(q)

    poses = [p for p in poses if p["start"] is not None] + [p for p in poses if p["start"] is None]
    seq = {
        "title": args.title,
        "subtitle": args.subtitle,
        "fps": lmk.get("fps"),
        "generated": str(date.today()),
        "source": Path(lmk.get("video", "")).name,
        "frames": frames,
        "poses": poses,
    }
    write_sequence_js(Path(args.out), seq)
    log("다음: python3 -m http.server 8080 → http://localhost:8080/wingchun/")


if __name__ == "__main__":
    main()
