# 세션 로그 — 2026-06-27 · AI TOWER 성능·프로젝트노드·SEO/i18n

**라이브:** https://mhh11222.github.io/hohyunmoon-pr-ai-tower/
**레포:** https://github.com/mhh11222/hohyunmoon-pr-ai-tower (public, GitHub Pages, main)
**로컬:** `~/Desktop/moon-ai-tower` · 실행 `python3 -m http.server 8080`
스택: 순수 Three.js r0.184(CDN importmap) + vanilla ESM + HTML/CSS, 빌드툴 없음, vitest **64 테스트**.
파이프라인: **writing-plans → /autoplan(리뷰) → TDD 구현 → /design-review(라이브 검증)** 한 세션 완주.

---

## 0. 발단
사용자: "AI 타워 웹사이트 이어서 하자." 메모리상 재개 지점 = P3(GitHub 노드)·P5(성능/SEO/i18n). 우선순위 1→2→3으로 (성능 → 노드 → SEO/i18n), 전 과정(계획·리뷰·구현·디자인리뷰)을 오늘 끝내기로.

## 1. 계획 (writing-plans)
3개 페이즈 1개 계획서로: `docs/superpowers/plans/2026-06-27-ai-tower-perf-nodes-seo.md`. 코드베이스 정밀 탐색 후 TDD 14태스크. 환경 제약 확정: **ffmpeg·cwebp 없음**(afconvert·sips만), 초상은 알파 필수(JPEG 불가), `objToWorld`/Z축 구조 등.

## 2. /autoplan 리뷰 (codex 미설치 → Claude 독립 보이스 3종)
CEO·Design·Eng가 사전맥락 없이 평가, 강하게 수렴.
- **기술 결함 7건(전원 일치):** ①`nodes.js`가 실재하지 않는 `objToWorld(x,y)`/Y-up에 코딩(실제 `objToWorld(o)` 스칼라·+Z·×1.45) → 노드 NaN·자체 테스트가 버그 통과. ②fly-to가 매프레임 `camera.position.z`(587)·`rig.rotation.z`(583) 덮어쓰기와 충돌 + **복귀 없음**. ③`scene/camera/world`는 `runThree()` 지역변수(모듈스코프 wiring=ReferenceError). ④초상 알파 미검증. ⑤null 가드·중복 리스너. ⑥노드 가독성(입자필드에 위장). ⑦토글이 KO 포털 깨뜨림·decode 상실.
- **전략 재고 4건(user challenge):** UC1 라이브 GitHub 노드 페이로드 비어있음(공개 레포=이 사이트 1개·0★) → 큐레이션 권고. UC2 "25MB 첫로딩"은 거짓(오디오 preload=none 지연). UC3 WebGL-only는 크롤러·SR에 안 보임 → 케이스스터디. UC4 SEO는 커스텀 도메인 먼저.
- 리뷰 리포트는 플랜 파일 `## GSTACK REVIEW REPORT`에 기록.

## 3. 사용자 결정
- **Phase 2 = 큐레이션 카드 → 3D 노드.** 비공개 프로젝트는 **코드 비공개, 성과/임팩트로 "대단하다" 인상만.**
- 자동 채택: UC3=큐레이션 미러를 크롤 가능한 HTML로(케이스스터디 갈음), UC4=github.io 유지·URL 1곳 교체식, i18n=navigator 자동감지·EN/KO 완전 동등.

## 4. TDD 구현 (64 테스트)
### Phase 1 — 성능
- 오디오: `afconvert -f m4af -d aac -b 64000 -s 0` → 20MB mp3 → **4.1MB** m4a, mp3 제거, `audio.js` SRC 교체. (VBR `-s 3`은 `-b` 무시 → CBR `-s 0` 필수였음.)
- 초상: `sips --resampleHeightWidthMax 900` → 1547×3549 5.5MB → 392×900 **485KB**, 알파 보존. (경로 불변 → 코드변경 0.)
- `tests/assets.test.js`: 용량·SRC·**PNG IHDR 알파바이트(4|6)**·mp3 제거 회귀잠금.
- *정직한 재서술: 오디오는 지연로드라 첫로딩 실익 아님 → 초상 리사이즈가 첫로딩 win.*

### Phase 2 — 프로젝트 노드(P3 재설계)
- `data/projects.js`(큐레이션 단일소스, EN/KO): VELVOID 멘토(비공개)·AI 타워(공개)·리플렉티브-파레토 진화(비공개).
- `src/nodes.js`: `projectToObjective`(FNV 결정론)·`nodePlacements`(순수, **정확한 +Z·Z_SCALE**, 테스트)·`buildProjectNodes`(thermal core+halo+**투명 히트구 0.22**+스템).
- `Z_SCALE`을 순수 `landscape.js`로 이동(재export from field.js) → nodes.js가 THREE import체인 밖 → 단위테스트 가능.
- `src/projectui.js`: 호버 팁·정보 패널·크롤/SR 미러(`renderProjectsMirror`, XSS escape).
- `main.js`(전부 `runThree()` 내부): world에 노드 마운트·레이캐스트 호버(스케일+커서+팁)·클릭→패널+fly-to·ESC/닫기→홈복귀, fly중 rig freeze·`flyTarget` 해제, 포털 진입 후로 게이팅.
- index.html: `#project-panel`·`#node-tip`·크롤용 `<section id=projects>`. css: 패널·노드커서·미러(sr-only).

### Phase 3 — SEO/i18n(P5)
- OG/Twitter/canonical/JSON-LD(Person)+theme-color, **`assets/og.jpg` 1200×630**(sips). URL은 도메인 교체 주석으로 1곳.
- `src/i18n.js`(`detectLang`/`applyLang`, 순수·테스트). `body[data-lang]` 표시 + **KO 포털·타이틀 승격(T7)** + 토글 아웃라인 active(디자인리뷰). decode를 활성 언어에 재실행(KO 패리티). FOUC 방지 `<body data-lang=en>`.

## 5. /design-review (실제 브라우저 라이브 검증)
gstack browse(헤드리스)로 검증: 포털 입자초상 렌더(알파 OK)·진입→지형·**AETHER LIVE(m4a 재생)**·노드 클릭→패널("VELVOID 멘토")→fly-to→ESC 복귀·**EN/KO 토글(person-en 숨김·KO 승격·미러 KO 재렌더)**. **콘솔 에러 0.**
- **FINDING-1 수정:** 노드 0.06이 입자필드에 위장+클릭난해(Design+Eng M4) → core 0.08+halo 0.14+**투명 히트구 0.22**, 호버 스케일. 재검증 OK.

## 6. 커밋 (origin/main 푸시 완료)
- `33f40b0` perf(assets): AAC m4a + 초상 리사이즈
- `c94d45f` feat(nodes): 큐레이션 프로젝트 노드
- `da0c5b6` feat(seo+i18n): 공유 메타 + EN/KO 토글
- `d9664d4` docs(plan): 계획 + autoplan 리뷰 리포트
- `af05c5c` style(design): FINDING-1 노드 가독·클릭성

## 7. 정직한 caveat / 재개
- **`data/projects.js` 카피 = 초안**(제 지식 기반) → 사용자 검수 필요(특히 비공개 프로젝트 표현).
- 헤드리스 WebGL은 소프트웨어 렌더 → 노드 시각은 실 GPU에서 재확인(로컬 open으로 확인함).
- 남음: 커스텀 도메인(지금 github.io) · 포털 "CLICK TO ENTER" 한국어화 · 포털 전환 튜닝 · OG 카드 디자인 고도화(지금 얼굴 크롭).
</content>
