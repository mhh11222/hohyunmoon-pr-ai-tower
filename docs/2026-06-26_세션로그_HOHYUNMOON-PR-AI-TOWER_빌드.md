# 세션 로그 — 2026-06-26 · HOHYUNMOON PR AI TOWER (포트폴리오 사이트) 빌드

**라이브:** https://mhh11222.github.io/hohyunmoon-pr-ai-tower/
**레포:** https://github.com/mhh11222/hohyunmoon-pr-ai-tower (public, GitHub Pages, main)
**로컬:** `~/Desktop/moon-ai-tower` · 실행 `python3 -m http.server 8080`
스택: 순수 Three.js r0.184(CDN importmap) + vanilla ESM + HTML/CSS, 빌드툴 없음, 정적, vitest(46 테스트).

---

## 0. 한 줄
문호현 자랑용 포트폴리오. 주인공 = 본인이 만든 유전알고리즘이 **눈앞에서 진화**하는 라이브 WebGL. "살아있는 기계."

## 1. 파이프라인 (전부 거침)
office-hours(Builder) → brainstorming(채택안 C "사이트가 곧 GA") → /spec → writing-plans(P1) → /autoplan(CEO·Eng·DX, Option B 게이트) → design-consultation(디자인 시스템) → design-shotgun(시안 A/B/C → A+C 하이브리드) → subagent 빌드(P1) → design-review(오디오+QA) → stop-slop/ko 카피 → 배포 → P2 진화 → 3D 지형+자동재생 → 얼굴 포털.

## 2. 레퍼런스 역설계
borealis.cool = Three.js r184 `THREE.Points` + 커스텀 가산혼합 ShaderMaterial(싸인 노이즈 오로라). 클론 회피 차별화: globe→**수직 타워/3D 지형**, 장식→**모노 텔레메트리 HUD = 살아있는 계기판**. 추가 레퍼런스 `docs/visual-reference-fitness-landscape.jpeg`(3D 적합도 surface + 빨강 × 최적) → 우리 팔레트로 커스텀.

## 3. 디자인 시스템 (docs/DESIGN.md)
팔레트 순흑 `#000` / 시안 `#5eeaff`(강조·링크) / 파레토 그린 `#38f27f` / 써멀 `#ff6a3d`(발열) / 본문 `#f4f3ee`(시안 본문 금지). 폰트 Space Grotesk(디스플레이)+JetBrains Mono(본문/HUD), 셀프호스팅 OFL. 모션: "전부 움직이되 안 싸운다" — 느린 ambient + 포컬 1개, 스태거, `prefers-reduced-motion` 정지.

## 4. 구현된 것
- **얼굴 포털:** `assets/portrait.png` → 입자 초상(~7.6k 알파 샘플). 클릭/Enter/skip → 카메라가 머리로 dolly-in, 헬릭스/산란("뇌·유전자") → 3D 지형으로 핸드오프. (`portal.js`/`portrait.js`)
- **3D 적합도 지형:** 128² surface 다봉, 높이램프(딥잉크→aurora-dim→시안→그린→thermal 정상), **빨강 × 전역최적**+챔피언 빔, 격자/축(OBJ-X/Y/FITNESS↑). (`landscape.js`/`field.js`)
- **16세대 진화 애니메이션:** ~2.8s마다 개체군이 봉우리로 lerp 등반·파레토 능선 재계산·챔피언 폭발/러시인 교체·FITNESS 0.55→0.97 카운트업·CHAMP 디코드. reduced-motion=수렴 정지. (`data/evo.js`/`main.js`)
- **AETHER BGM:** 첫 제스처 자동재생(차단 정직 대응) + 재생/일시정지/정지/음소거/볼륨 + 16바 비주얼라이저(우하단). 음소거·reduced-motion이면 자동시작 안 함. (`audio.js`/`visualizer.js`)
- **HUD·인터랙션:** 텔레메트리(GEN/FITNESS/CHAMP), 커서 레티클+좌표+스캔, 기계 디코드 텍스트. (`decode.js`/`axislabels.js`)
- **콘텐츠:** 영어 기본+한글 서브, 전문가/기술 카피(stop-slop EN/KO). HOHYUN MOON · *Full-stack engineer · genetic-algorithm researcher* · "I build agentic AI systems where strategy evolves…(VELVOID/reflective-Pareto/Thompson/pgvector RAG)". 연락 github.com/mhh11222.
- **품질:** 46/46 vitest, WebGL try/catch 폴백, a11y(canvas aria-hidden·실제 헤딩·focus·키보드 Enter), 모바일 입자 감축, 셀프호스팅 폰트.

## 5. /autoplan에서 잡아 반영한 핵심 (P1)
M3 셰이더 uniform 선언(흑화면 방지)·데이터 ESM 인라인(file://·Pages 서브패스)·회전 Object3D·PointSize 클램프·입자 밀도(K위성)·DPR 리사이즈·reduced-motion·WebGL 폴백. (autoplan은 "콘텐츠 먼저(역전)"를 권고했으나 사용자가 원안 C 스펙터클 우선 유지 = 결정 B.)

## 6. 정직한 caveat / 로드맵
- Pages 재빌드 1–2분. reduced-motion은 코드리뷰만 → OS "동작 줄이기"로 수동 확인 권장.
- 오디오 20MB·초상 5.5MB → 첫 로딩 무거움 → **압축 권장(96kbps mp3, 초상 리사이즈/webp)**.
- 커서→지형 좌표는 근사치(글로우용).
- 남음: **P3** GitHub 프로젝트 노드(fly-to, GitHub API) · **P5** 폴리시/성능/SEO·OG/풀 i18n · 커스텀 도메인 · 포털 전환 튜닝.

## 7. 별개 프로젝트 — VELVOID 멘토
이 사이트와 무관. 멘토 슬라이스 ④ 감각층은 **설계만 완료**(구현 0), `velvoid-mentor` 레포 `DOC/2026-06-26_세션로그_슬라이스4_*` + 이슈 #8 + 브랜치 `slice4-sensing-plan`(푸시됨)에 보관.
