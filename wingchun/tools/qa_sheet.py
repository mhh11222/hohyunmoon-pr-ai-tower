#!/usr/bin/env python3
"""QA 시트: 책 사진 크롭과, 그 자세에 매칭된 영상 프레임(인물 주변 확대)을 나란히 놓은 이미지.
정렬이 맞는지 눈으로 확인하는 용도. extract_poses가 저장한 프레임별 인물 상자(box)를 쓴다.

  python3 tools/qa_sheet.py --work work --out work/qa   → work/qa/sheet1.jpg, sheet2.jpg …
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from pose_common import load_json, log


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default="work")
    ap.add_argument("--poses", default=None, help="work/poses.json 대신 쓸 파일")
    ap.add_argument("--out", default=None, help="출력 폴더 (기본 work/qa)")
    ap.add_argument("--per-sheet", type=int, default=30)
    ap.add_argument("--cols", type=int, default=6)
    args = ap.parse_args()

    work = Path(args.work)
    out = Path(args.out or work / "qa"); out.mkdir(parents=True, exist_ok=True)
    frames = load_json(work / "landmarks.json")["frames"]
    poses = load_json(args.poses or work / "poses.json")
    T = 220
    cells = []
    for p in poses:
        if p.get("frameIndex") is None:
            continue
        f = frames[p["frameIndex"]]
        img_path = work / "frames" / f"{f['index']:06d}.jpg" if f else None
        v = cv2.imread(str(img_path)) if img_path and img_path.exists() else None
        cell = np.full((T + 22, 380, 3), 255, np.uint8)
        if v is not None:
            H, W = v.shape[:2]
            if f.get("box"):
                x0, y0, x1, y1 = f["box"]
                cx, cy = (x0 + x1) / 2 * W, (y0 + y1) / 2 * H
                side = max((x1 - x0) * W, (y1 - y0) * H) * 1.25
                X0, Y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
                X1, Y1 = int(min(W, cx + side / 2)), int(min(H, cy + side / 2))
                v = v[Y0:Y1, X0:X1]
            cell[22:, 155:155 + T] = cv2.resize(v, (T, T))
        book = cv2.imread(p["image"]) if p.get("image") and Path(p["image"]).exists() else None
        if book is not None:
            h, w = book.shape[:2]; s = T / h
            b = cv2.resize(book, (max(1, int(w * s)), T))[:, :150]
            cell[22:, :b.shape[1]] = b
        cv2.putText(cell, f"{p['id']} {p['name'][:8]} {p['key']:.1f}s", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 200), 1)
        cells.append(cell)
    n = 0
    for n, s in enumerate(range(0, len(cells), args.per_sheet), 1):
        part = cells[s:s + args.per_sheet]
        while len(part) % args.cols:
            part.append(np.full_like(cells[0], 255))
        rows = [np.hstack(part[i:i + args.cols]) for i in range(0, len(part), args.cols)]
        cv2.imwrite(str(out / f"sheet{n}.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 82])
    log(f"[qa] {len(cells)}자세 → {out}/sheet1..{n}.jpg")


if __name__ == "__main__":
    main()
