#!/usr/bin/env python3
"""2단계: 책 사진 → 3D 자세 인식 → 영상의 정지 구간에 순서대로 맞춘다.

사용:
  python3 tools/match_book.py --work work --book book [--poses poses.json]

  book/         책 자세 사진 (파일명 순서 = 동작 순서. 01.jpg, 02.jpg …)
  poses.json    (선택) 자세 이름·설명. 없으면 사진 순서대로 "자세 n"으로 두고
                work/poses.json 을 만들어 주니 거기에 이름을 채우면 된다.

결과: work/poses.json — 각 자세의 이름, 책 사진 경로, 책 자세 관절(ref), 영상 구간(start/end/key)
"""
from __future__ import annotations

import argparse
from pathlib import Path

from pose_common import (
    align_refs_to_frames, assign_refs_to_holds, ensure_model, load_json, log, make_landmarker, pose_distance,
    save_json, world_to_viewer,
)

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def detect_image(landmarker, path: Path):
    import mediapipe as mp

    img = mp.Image.create_from_file(str(path))
    res = landmarker.detect(img)
    if not res.pose_world_landmarks:
        return None
    return world_to_viewer(res.pose_world_landmarks[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default="work")
    ap.add_argument("--book", default="book", help="책 사진 폴더")
    ap.add_argument("--poses", default=None, help="자세 이름/설명 JSON (배열)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--no-match", action="store_true", help="자세 유사도 매칭 없이 사진 순서 = 정지 구간 순서로 붙임")
    ap.add_argument("--dtw", action="store_true", help="정지 구간 대신 전체 프레임 시간순 정렬을 강제")
    ap.add_argument("--min-gap", type=float, default=0.3, help="시간순 정렬에서 자세 사이 최소 간격(초)")
    ap.add_argument("--half", type=float, default=0.2, help="시간순 정렬에서 자세 창 반폭(초)")
    args = ap.parse_args()

    work = Path(args.work)
    landmarks = load_json(work / "landmarks.json")
    frames = landmarks["frames"]
    holds = load_json(work / "holds.json")
    log(f"[holds] 영상 정지 구간 {len(holds)}개")

    images = sorted(p for p in Path(args.book).iterdir() if p.suffix.lower() in IMG_EXT) if Path(args.book).is_dir() else []
    log(f"[book] 사진 {len(images)}장")

    meta = load_json(args.poses) if args.poses else []
    if meta and images and len(meta) != len(images):
        log(f"[warn] poses.json 항목 {len(meta)}개 ≠ 사진 {len(images)}장. 앞에서부터 짝지어 붙입니다.")

    refs = []
    if images:
        landmarker = make_landmarker(ensure_model(args.model), "image")
        for p in images:
            lm = detect_image(landmarker, p)
            log(f"   {p.name}: {'인식' if lm else '인식 실패 (사진에 전신이 보이는지 확인)'}")
            refs.append(lm)
        landmarker.close()

    n = max(len(meta), len(images), len(holds) if not (meta or images) else 0)
    hold_lms = [frames[h["keyIndex"]]["lm"] for h in holds]

    good = [i for i, r in enumerate(refs) if r is not None]
    fps = landmarks.get("fps") or 15
    # 영상이 쉬지 않고 이어져 정지 구간이 사진 수보다 훨씬 적으면: 전체 프레임에 시간순 정렬(DTW)
    if images and not args.no_match and good and (args.dtw or len(holds) < 0.7 * len(good)):
        log(f"[align] 정지 구간({len(holds)})이 사진({len(good)})보다 적어 전체 프레임 시간순 정렬을 씁니다")
        aligned = align_refs_to_frames([refs[i] for i in good], frames, min_gap=max(2, int(args.min_gap * fps)))
        keys = {}
        for k, i in enumerate(good):
            keys[i] = aligned[k]
        # 창(window): 대표 프레임 ± half, 이웃 대표와의 중간을 넘지 않게
        ts = [keys[i]["t"] for i in sorted(keys)]
        poses = []
        for i in range(n):
            m = meta[i] if i < len(meta) else {}
            img = images[i] if i < len(images) else None
            k = keys.get(i)
            if k:
                j = sorted(keys).index(i)
                lo = (ts[j - 1] + ts[j]) / 2 if j > 0 else 0.0
                hi = (ts[j] + ts[j + 1]) / 2 if j + 1 < len(ts) else frames[-1]["t"]
                start = max(lo, k["t"] - args.half); end = min(hi, k["t"] + args.half)
            poses.append({
                "id": m.get("id") or f"p{i + 1:02d}", "name": m.get("name") or f"자세 {i + 1}", "zh": m.get("zh", ""),
                "desc": m.get("desc", ""), "cues": m.get("cues", []), "transition": m.get("transition", ""),
                "image": m.get("image") or (f"book/{img.name}" if img else None),
                "ref": refs[i] if i < len(refs) else None,
                "start": round(start, 3) if k else None, "end": round(end, 3) if k else None, "key": k["t"] if k else None,
                "frameIndex": k["frameIndex"] if k else None,
                "holdIndex": -1, "matchDistance": k["distance"] if k else None,
            })
        save_json(work / "poses.json", poses)
        log("[align] 자세 ↔ 영상 시각:")
        for p in poses:
            log(f"   {p['id']} {p['name']:<14} {p['key'] if p['key'] is not None else '—':>6}s  거리 {p['matchDistance']}")
        log(f"[done] {work / 'poses.json'}")
        log("다음: python3 tools/build_sequence.py --work work --out data/sequence.js --title '...'")
        return

    # 책 사진 → 정지 구간 배정
    if images and not args.no_match and any(r is not None for r in refs):
        # 인식 안 된 사진은 앞 사진의 배정 다음으로 순서 배정
        good = [i for i, r in enumerate(refs) if r is not None]
        assigned = assign_refs_to_holds([refs[i] for i in good], hold_lms)
        mapping = [-1] * len(images)
        for k, i in enumerate(good):
            mapping[i] = assigned[k]
    else:
        mapping = [i if i < len(holds) else -1 for i in range(n)]

    # 인식 실패 사진: 이웃 사이의 남는 구간을 순서대로 채움
    for i in range(len(mapping)):
        if mapping[i] >= 0:
            continue
        prev = max([m for m in mapping[:i] if m >= 0], default=-1)
        nxt = min([m for m in mapping[i + 1:] if m >= 0], default=len(holds))
        cand = prev + 1
        mapping[i] = cand if cand < nxt and cand < len(holds) else -1

    poses = []
    for i in range(n):
        m = meta[i] if i < len(meta) else {}
        img = images[i] if i < len(images) else None
        h = holds[mapping[i]] if i < len(mapping) and mapping[i] >= 0 else None
        pose = {
            "id": m.get("id") or f"p{i + 1:02d}",
            "name": m.get("name") or f"자세 {i + 1}",
            "zh": m.get("zh", ""),
            "desc": m.get("desc", ""),
            "cues": m.get("cues", []),
            "transition": m.get("transition", ""),
            "image": m.get("image") or (f"book/{img.name}" if img else None),
            "ref": refs[i] if i < len(refs) else None,
            "start": h["start"] if h else None,
            "end": h["end"] if h else None,
            "key": h["key"] if h else None,
            "frameIndex": h["keyIndex"] if h else None,
            "holdIndex": mapping[i] if i < len(mapping) else -1,
        }
        if h and pose["ref"]:
            pose["matchDistance"] = round(pose_distance(pose["ref"], frames[h["keyIndex"]]["lm"]), 3)
        poses.append(pose)

    save_json(work / "poses.json", poses)
    log("[match] 자세 ↔ 영상 구간:")
    for p in poses:
        seg = f"{p['start']:.2f}~{p['end']:.2f}s" if p["start"] is not None else "구간 없음 (holds.json에서 수동 지정)"
        d = f"  유사도거리 {p['matchDistance']}" if "matchDistance" in p else ""
        log(f"   {p['id']} {p['name']:<14} {seg}{d}")
    unused = sorted(set(range(len(holds))) - {m for m in mapping if m >= 0})
    if unused:
        log(f"[note] 사진이 붙지 않은 정지 구간: {[u + 1 for u in unused]} (work/holds.json 번호)")
    log(f"[done] {work / 'poses.json'} — 이름/설명을 고치고 싶으면 이 파일을 편집한 뒤 build 하세요.")
    log("다음: python3 tools/build_sequence.py --work work --out data/sequence.js --title '소념두'")


if __name__ == "__main__":
    main()
