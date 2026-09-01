# 영춘권 자세 가이드 (/wingchun/) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영춘권 초보자가 (1) 시범 영상 1분 13초와 (2) 책 『영춘권 기본동작(1)』 90자세 사진·설명을 가지고, 3D 인체로 동작을 재생·정지·회전·확대하며 자세 이름·각도·전환 요령을 배우고, (3) 폰 카메라로 자기 자세를 실시간 대조할 수 있는 공개 웹 페이지를 만든다.

**Architecture:** 빌드툴 없는 순수 ESM 정적 사이트(기존 mahjong/과 같은 구조, GitHub Pages). 순수 계산(관절 각도·몸 기준틀·정지 구간 분할·자세 정규화·시간순 정렬)은 `src/`에 두고 vitest로 TDD. three.js 인체·DOM 배선은 `ui/`에 얇게. 영상·사진 처리는 오프라인 Python 파이프라인(`tools/`, MediaPipe Pose + OpenCV)이 하고 결과를 ESM 데이터(`data/sequence.js`)로 굽는다 — 런타임 fetch 없음(`file://`에서도 동작). 카메라 대조만 브라우저에서 MediaPipe tasks-vision(WASM)을 CDN에서 받아 기기 안에서 돌린다.

**Tech Stack:** three.js r0.185(mahjong/vendor 재사용), vanilla ESM, vitest 2.1, Python 3.11 + mediapipe 1.0 + opencv-headless + numpy, Playwright(QA), GitHub Pages.

**환경 사실:**
- 세션 샌드박스는 구글 드라이브·github.io·jsdelivr 접근이 막혀 있다 → 영상은 채팅 첨부(30MB 제한, 카카오톡 압축본 24MB)로 받았고, 카메라 기능의 CDN 로딩은 실기기에서만 확인 가능.
- 시범 영상은 화면 녹화(1586×884, 36fps)이며 인물이 작다(약 250px). 정지 구간이 9개뿐 → 멈춤 기준 분할 대신 시간순 정렬(DTW)이 필요했다.
- 책 사진은 페이지를 찍은 것 → 검은 옷 블롭 검출로 자세별 자동 크롭.

**규칙:** DRY · YAGNI · TDD · 잦은 커밋. 공개 페이지이므로 CSP·개인정보(카메라 영상 비전송)·비밀값 없음 유지.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `wingchun/src/skeleton.js` | 관절 33개·뼈 연결·좌우 구분 |
| `wingchun/src/angles.js` | 각도·몸 기준틀·전환 설명·일치도 (순수) |
| `wingchun/src/sequence.js` | 보간·정지 구간·정규화·정렬·검증 (순수) |
| `wingchun/ui/figure3d.js` | three.js 인체(본체·유령·책·내 자세), 각도 호 |
| `wingchun/ui/controls.js` | 궤도 카메라(드래그·휠·핀치) |
| `wingchun/ui/camera.js` | 브라우저 MediaPipe 자세 인식 |
| `wingchun/ui/app.js` | 상태·모드·카드·각도표·카메라 대조 |
| `wingchun/tools/*.py` | 영상→관절, 책 사진→자세, 정렬, 데이터 굽기 |
| `wingchun/data/sequence.js` | 생성 데이터 (책 90 + 영상 1324프레임) |
| `wingchun/tests/*.test.js` | 순수 모듈·데이터 회귀 |

---

## Phase 1 — 뷰어 골격 + 파이프라인 (완료)
- [x] 각도·시퀀스 순수 모듈 TDD (angles/sequence 테스트)
- [x] 3D 인체·궤도 컨트롤·모드 3종·조그·각도표·전환 카드
- [x] extract_poses / match_book / build_sequence / make_demo
- [x] 합성 영상으로 파이프라인 end-to-end 검증

## Phase 2 — 책 90자세 (완료)
- [x] 페이지 사진 12장 → 블롭 검출·회전 판별·격자 보정으로 90장 크롭
- [x] 이름·한자·설명 poses.json, book_only.py로 영상 전 미리보기 데이터

## Phase 3 — 시범 영상 정렬 (완료)
- [x] 1324프레임 관절 추출(97% 인식), 시간순 정렬(align_refs_to_frames)
- [x] QA 시트(책 크롭 vs 영상 프레임)로 전체 흐름 검증

## Phase 4 — 공개 배포·가로세로·카메라 대조 (완료)
- [x] 가로 레이아웃(스티키 3D + 스크롤 패널), 카메라 대조(일치도·교정 문장·각도표 "나" 열)
- [x] PR #14 → main → GitHub Pages

## Phase 5 — 실제 서비스 품질 (이 세션)
- [x] 보안: CSP meta(script-src self+jsdelivr, connect-src jsdelivr+googleapis), referrer no-referrer, CDN 버전 고정, 인라인 스크립트 제거, 개인정보 고지, 비밀값 스캔
- [x] 5개 화면 크기 자동 QA(콘솔 오류 0, 가로 넘침 0, 스티키 열 잘림 수정)
- [x] 독립 리뷰(엔지니어링·디자인) → 지적 사항 반영
- [ ] 세션 로그 · README 갱신 · PR → main 배포 확인
