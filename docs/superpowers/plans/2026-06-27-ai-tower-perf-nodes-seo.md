<!-- /autoplan restore point: /Users/songempty/.gstack/projects/mhh11222-hohyunmoon-pr-ai-tower/main-autoplan-restore-20260627-021509.md -->
# AI TOWER — 성능 최적화 · GitHub 노드(P3) · SEO/OG/i18n(P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브 포트폴리오 사이트(HOHYUNMOON PR AI TOWER)의 (1) 첫 로딩 무게를 25MB→~4MB로 줄이고, (2) 실제 GitHub 레포를 지형 위 노드로 띄워 클릭 시 카메라가 날아가며 정보를 보여주고, (3) 검색/공유(SEO·OG) 메타와 한/영 토글을 추가한다.

**Architecture:** 빌드툴 없는 순수 Three.js 정적 사이트. 순수 로직(자료 정규화·언어 감지·노드 좌표)은 별도 ESM 모듈로 분리해 vitest로 TDD하고, Three.js 렌더/카메라/DOM 배선은 그 위에 얇게 얹는다. 외부 의존(GitHub API)은 **fetch + 인라인 폴백**으로 격리해 `file://`·오프라인·rate-limit에서도 깨지지 않게 한다(evo.js의 "no hard fetch" 원칙 계승). 자산 압축은 macOS 기본 도구(`afconvert`·`sips`)만 사용한다(ffmpeg/cwebp 부재 확정).

**Tech Stack:** Pure Three.js r0.184(CDN importmap), vanilla ESM, HTML/CSS, vitest 2.1, macOS `afconvert`(AAC)·`sips`(PNG/JPEG). 빌드 없음.

**환경 사실(탐색으로 확정):**
- `ffmpeg`·`cwebp` **없음**. `sips`는 **webp 미지원**(PNG/JPEG/HEIC/GIF만 writable). `afconvert`는 AAC `.m4a`/`.caf` 출력(전 브라우저 지원).
- `assets/ambient.mp3` = 21,081,898 B(20MB), audio.js L11 `const SRC = "./assets/ambient.mp3";`.
- `assets/portrait.png` = 5,782,058 B(5.5MB), **1547×3549, hasAlpha: yes**. 코드(`portal.js`)는 `imageToPixels(img, 760|520)`로 다운샘플하고 `samplePortrait`가 **alpha>임계로 픽셀 마스킹**(`src/portrait.js:158-159`) → JPEG 불가, **PNG로 리사이즈**해야 알파 보존.
- 언어 카피는 EN/KO `<span class="en">`/`<span class="ko" lang="ko">`가 **동시 표시**(스택). main.css가 `.en{display:block}`·`.ko{display:block}`로 둘 다 보여줌. 토글 없음.
- decode 효과는 `main.js:60` `document.querySelectorAll(".titleblock .decode")`(=`.en` 요소들)에 적용.
- 배포 = GitHub Pages, `.nojekyll` 존재, base-path 로직 없음, 모든 경로 상대(`./...`). 라이브 URL `https://mhh11222.github.io/hohyunmoon-pr-ai-tower/`.
- 테스트: `npm test`(=`vitest run`), 테스트 디렉터리 `tests/`, 순수모듈 import해서 단언.

**규칙:** DRY · YAGNI · TDD · 잦은 커밋. 각 페이즈 끝에서 동작하는 사이트가 나와야 하고, 페이즈 단위로 커밋·배포 가능하다. **자산 바이너리(mp3/png/m4a)는 용량 크므로 변경 시 한 번에 커밋**하고 메시지에 용량 명시.

---

## File Structure

| 파일 | 책임 | 페이즈 |
|---|---|---|
| Modify `assets/ambient.mp3`→Create `assets/ambient.m4a` | AAC 압축 오디오(20MB→~3MB) | 1 |
| Modify `assets/portrait.png` (in-place 리사이즈) | 알파 보존 PNG 축소(5.5MB→<0.6MB) | 1 |
| Modify `src/audio.js:11` | `SRC`를 `.m4a`로 | 1 |
| Create `tests/assets.test.js` | 자산 용량·audio SRC 회귀 잠금 | 1 |
| Create `src/repos.js` | 순수: 폴백목록·정규화·선별·좌표·fetch폴백 | 2 |
| Create `tests/repos.test.js` | repos.js TDD | 2 |
| Create `src/nodes.js` | Three.js 레포 노드 빌드(스프라이트+라벨) | 2 |
| Modify `src/main.js` | 노드 마운트·레이캐스트 클릭·fly-to·패널 토글 | 2 |
| Modify `index.html` | `#repo-panel` 정보 카드 DOM | 2 |
| Modify `styles/main.css` | `#repo-panel` 스타일 | 2 |
| Modify `index.html` `<head>` | SEO/OG/twitter/canonical/JSON-LD | 3 |
| Create `assets/og.jpg` | 1200×630 OG 카드(sips 생성) | 3 |
| Create `src/i18n.js` | 순수: 언어 감지·영속·적용 | 3 |
| Create `tests/i18n.test.js` | i18n.js TDD | 3 |
| Modify `index.html` | `#lang-toggle` 버튼 | 3 |
| Modify `styles/main.css` | `body[data-lang]` 표시 규칙 + 토글 스타일 | 3 |
| Modify `src/main.js` | i18n 초기화 배선 | 3 |

**자료형 계약(태스크 간 고정):**
- `normalizeRepo(raw) -> {name, desc, url, lang, stars, updated}` (없는 필드는 빈문자열/0)
- `pickRepos(list, n=6) -> Repo[]` (fork 제외 → stars desc, 동률 updated desc → 상위 n)
- `repoToObjective(repo) -> {x, y}` (둘 다 0..1, 이름 해시 기반 결정론적)
- `fetchRepos(user, {fetchImpl, signal}) -> Promise<Repo[]>` (성공=정규화·선별된 배열, 실패/비정상=FALLBACK_REPOS)
- `detectLang(nav, store) -> "en"|"ko"`, `applyLang(lang, {doc, store}) -> void`
- 노드 좌표는 `landscape.js`의 `objToWorld(x, y)`로 월드 변환(높이는 표면 위 고정 오프셋).

---

# PHASE 1 — 성능/로딩 최적화 (오디오·초상 압축)

## Task 1: 자산 회귀 테스트 먼저 (목표 용량·SRC 잠금)

**Files:**
- Create: `tests/assets.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/assets.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { statSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sizeKB = (p) => statSync(resolve(ROOT, p)).size / 1024;

describe("asset budget", () => {
  it("compressed audio exists and is under 5 MB", () => {
    expect(existsSync(resolve(ROOT, "assets/ambient.m4a"))).toBe(true);
    expect(sizeKB("assets/ambient.m4a")).toBeLessThan(5 * 1024);
  });

  it("portrait png stays alpha-capable but under 800 KB", () => {
    expect(sizeKB("assets/portrait.png")).toBeLessThan(800);
  });

  it("audio.js points at the .m4a source", () => {
    const src = readFileSync(resolve(ROOT, "src/audio.js"), "utf8");
    expect(src).toMatch(/const SRC = "\.\/assets\/ambient\.m4a";/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/assets.test.js`
Expected: FAIL — `ambient.m4a` 없음 / portrait 5.5MB / SRC 아직 `.mp3`.

- [ ] **Step 3: 커밋(테스트만)**
```bash
git add tests/assets.test.js
git commit -m "test(perf): lock asset budget — m4a audio, <800KB portrait, m4a SRC"
```

---

## Task 2: 오디오 AAC 압축 (afconvert)

**Files:**
- Create: `assets/ambient.m4a`
- Delete: `assets/ambient.mp3`
- Modify: `src/audio.js:11`

- [ ] **Step 1: AAC로 인코딩**

Run:
```bash
cd ~/Desktop/moon-ai-tower
afconvert -f m4af -d aac -b 96000 -s 3 assets/ambient.mp3 assets/ambient.m4a
ls -lh assets/ambient.m4a
```
Expected: `assets/ambient.m4a` 생성, 크기 ≈ 2–3MB (96kbps × 길이). 만약 `-b 96000`가 거부되면 `afconvert -f m4af -d 'aac ' -b 96000 ...`(데이터포맷에 공백 포함) 또는 `-d aac@44100`로 재시도.

- [ ] **Step 2: 길이/재생 가능 검증**

Run:
```bash
afinfo assets/ambient.m4a | grep -E "duration|data format|bit rate"
afinfo assets/ambient.mp3 | grep -E "duration"
```
Expected: m4a duration이 원본 mp3와 동일(±0.1s). data format = aac.

- [ ] **Step 3: 원본 mp3 제거**

Run:
```bash
git rm assets/ambient.mp3
```
(20MB를 레포에서 제거. 누락 시 audio.js의 error 핸들러가 페이지를 안전하게 유지함 — `src/audio.js`에 이미 존재.)

- [ ] **Step 4: audio.js SRC 교체**

`src/audio.js:11` 을 교체:
```javascript
const SRC = "./assets/ambient.m4a";
```

- [ ] **Step 5: 자산 테스트 부분 통과 확인**

Run: `npm test -- tests/assets.test.js`
Expected: 오디오 관련 2개(`m4a exists`, `audio.js SRC`) PASS. 초상 테스트는 아직 FAIL(다음 태스크).

- [ ] **Step 6: 커밋**
```bash
git add assets/ambient.m4a src/audio.js
git commit -m "perf(audio): AETHER → AAC m4a ~96kbps (20MB→~3MB), drop mp3"
```

---

## Task 3: 초상 PNG 리사이즈 (알파 보존)

**Files:**
- Modify: `assets/portrait.png` (in-place)

- [ ] **Step 1: 원본 백업(작업용, 커밋 안 함)**

Run:
```bash
cd ~/Desktop/moon-ai-tower
cp assets/portrait.png /tmp/portrait-orig.png
sips -g pixelWidth -g pixelHeight -g hasAlpha assets/portrait.png
```
Expected: 1547×3549, hasAlpha: yes.

- [ ] **Step 2: 긴 변 900px로 리사이즈(알파 유지 PNG)**

Run:
```bash
sips --resampleHeightWidthMax 900 assets/portrait.png --out assets/portrait.png
sips -g pixelWidth -g pixelHeight -g hasAlpha assets/portrait.png
ls -lh assets/portrait.png
```
Expected: ≈392×900, hasAlpha: **yes**(필수), 크기 < 700KB(보통 200–500KB). 코드는 ≤760px만 샘플하므로 화질 손실 없음.

> 알파가 `no`로 바뀌면 즉시 중단하고 백업 복원(`cp /tmp/portrait-orig.png assets/portrait.png`) 후 `--out` 형식을 png로 명시(`-s format png`)해 재시도. 알파가 사라지면 얼굴 마스킹이 깨진다.

- [ ] **Step 3: 자산 테스트 전체 통과 확인**

Run: `npm test -- tests/assets.test.js`
Expected: 3개 모두 PASS.

- [ ] **Step 4: 전체 회귀**

Run: `npm test`
Expected: 기존 46 + assets 3 = 49 PASS, 무회귀.

- [ ] **Step 5: 라이브 스모크(시각 확인)**

Run: `python3 -m http.server 8080` 후 브라우저 `http://localhost:8080`.
확인: 얼굴 입자 초상이 이전과 동일하게 보이고(알파 마스킹 정상), 클릭 시 뇌 zoom-in → 지형 전환, AETHER 재생 버튼으로 소리 남.

- [ ] **Step 6: 커밋 + 배포**
```bash
git add assets/portrait.png
git commit -m "perf(portrait): resize 1547x3549→max900 PNG, alpha kept (5.5MB→~0.4MB)"
git push
```
(GitHub Pages 1–2분 후 라이브 반영. 첫 로딩 ~25MB→~4MB.)

---

# PHASE 2 — GitHub 프로젝트 노드 (P3, fly-to)

## Task 4: 라이브 레포 디스커버리 + 폴백 목록 확정

**목적:** `mhh11222`의 **실제 public 레포**를 1회 관찰해 폴백 인라인 목록을 사실 기반으로 채운다(jandi 플랜의 스파이크 패턴). 이후 모든 노드 좌표/표시의 입력.

**Files:**
- (관찰만) → 결과를 Task 5의 `FALLBACK_REPOS`에 반영

- [ ] **Step 1: 공개 레포 관찰**

Run:
```bash
curl -s "https://api.github.com/users/mhh11222/repos?sort=updated&per_page=100" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d)); [print(r['name'], '|', r.get('stargazers_count',0), '|', r.get('language'), '|', (r.get('description') or '')[:60], '| fork=', r['fork']) for r in d]"
```
Expected: 공개 레포 목록 출력. 최소 `hohyunmoon-pr-ai-tower` 포함. (rate-limit 403이면 잠시 후 재시도; 그래도 안 되면 알려진 사실로 폴백 작성.)

- [ ] **Step 2: 폴백 후보 메모**

위 출력에서 fork=False이고 의미 있는(설명 있는/대표) 레포 상위 ~6개를 적어둔다. 최소 1개(`hohyunmoon-pr-ai-tower`)는 확정. 비공개인 `velvoid-mentor`는 API에 안 뜨므로 폴백에 **수동 포함하지 않는다**(공개된 것만 노출).

---

## Task 5: `repos.js` — 순수 정규화·선별·좌표 (TDD)

**Files:**
- Create: `src/repos.js`
- Test: `tests/repos.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/repos.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { normalizeRepo, pickRepos, repoToObjective, FALLBACK_REPOS } from "../src/repos.js";

describe("normalizeRepo", () => {
  it("maps GitHub fields to our shape with safe defaults", () => {
    const raw = { name: "x", description: null, html_url: "u", language: "JS",
                  stargazers_count: 4, updated_at: "2026-01-01T00:00:00Z", fork: false };
    expect(normalizeRepo(raw)).toEqual({
      name: "x", desc: "", url: "u", lang: "JS", stars: 4,
      updated: "2026-01-01T00:00:00Z", fork: false,
    });
  });
});

describe("pickRepos", () => {
  const mk = (name, stars, updated, fork = false) =>
    ({ name, desc: "", url: "", lang: "", stars, updated, fork });
  it("drops forks and sorts by stars then updated desc, caps at n", () => {
    const list = [mk("a", 1, "2026-01-01"), mk("b", 5, "2026-01-01"),
                  mk("c", 5, "2026-02-01"), mk("f", 9, "2026-01-01", true)];
    const out = pickRepos(list, 2);
    expect(out.map((r) => r.name)).toEqual(["c", "b"]); // fork 'f' 제외, 동률 stars=5는 updated 최신 c 먼저
  });
});

describe("repoToObjective", () => {
  it("is deterministic and within 0..1 on both axes", () => {
    const a = repoToObjective({ name: "velvoid-mentor" });
    const b = repoToObjective({ name: "velvoid-mentor" });
    expect(a).toEqual(b);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThanOrEqual(1);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeLessThanOrEqual(1);
  });
  it("spreads different names to different spots", () => {
    expect(repoToObjective({ name: "alpha" })).not.toEqual(repoToObjective({ name: "beta" }));
  });
});

describe("FALLBACK_REPOS", () => {
  it("is a non-empty normalized list", () => {
    expect(FALLBACK_REPOS.length).toBeGreaterThan(0);
    for (const r of FALLBACK_REPOS) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.url).toBe("string");
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/repos.test.js`
Expected: FAIL — `src/repos.js` 없음.

- [ ] **Step 3: 최소 구현**

`src/repos.js`:
```javascript
// src/repos.js — GitHub 레포를 노드로 띄우기 위한 순수 로직.
// 외부 fetch는 fetchRepos에서만, 실패하면 FALLBACK_REPOS로 폴백(file://·offline·rate-limit 견딤).

// Task 4 관찰값으로 채운다. 최소 1개는 확정 사실.
export const FALLBACK_REPOS = [
  {
    name: "hohyunmoon-pr-ai-tower",
    desc: "Live WebGL portfolio: a genetic algorithm evolving in objective space.",
    url: "https://github.com/mhh11222/hohyunmoon-pr-ai-tower",
    lang: "JavaScript",
    stars: 0,
    updated: "2026-06-26T00:00:00Z",
    fork: false,
  },
];

export function normalizeRepo(raw) {
  return {
    name: raw.name || "",
    desc: raw.description || "",
    url: raw.html_url || "",
    lang: raw.language || "",
    stars: raw.stargazers_count || 0,
    updated: raw.updated_at || "",
    fork: !!raw.fork,
  };
}

export function pickRepos(list, n = 6) {
  return (list || [])
    .filter((r) => !r.fork)
    .sort((a, b) => (b.stars - a.stars) || (b.updated > a.updated ? 1 : b.updated < a.updated ? -1 : 0))
    .slice(0, n);
}

// 이름을 0..1×0..1 평면에 결정론적으로 흩뿌린다(FNV-1a 해시 → 두 축).
export function repoToObjective(repo) {
  const name = (repo && repo.name) || "";
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const x = (h & 0xffff) / 0xffff;
  const y = ((h >>> 16) & 0xffff) / 0xffff;
  // 가장자리(축 라벨)와 안 겹치게 0.1..0.9로 인셋
  return { x: 0.1 + x * 0.8, y: 0.1 + y * 0.8 };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/repos.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**
```bash
git add src/repos.js tests/repos.test.js
git commit -m "feat(repos): pure normalize/pick/objective + fallback list"
```

---

## Task 6: `repos.js` — `fetchRepos` (fetch + 폴백)

**Files:**
- Modify: `src/repos.js`
- Test: `tests/repos.test.js`

- [ ] **Step 1: 실패 테스트 추가**

`tests/repos.test.js` 에 추가:
```javascript
import { fetchRepos } from "../src/repos.js";

const okFetch = (payload) => async () => ({ ok: true, json: async () => payload });

describe("fetchRepos", () => {
  it("returns normalized+picked repos on success", async () => {
    const payload = [
      { name: "live", description: "d", html_url: "u", language: "TS",
        stargazers_count: 3, updated_at: "2026-03-01T00:00:00Z", fork: false },
    ];
    const out = await fetchRepos("mhh11222", { fetchImpl: okFetch(payload) });
    expect(out[0].name).toBe("live");
    expect(out[0].desc).toBe("d");
  });

  it("falls back when fetch throws", async () => {
    const out = await fetchRepos("mhh11222", {
      fetchImpl: async () => { throw new Error("offline"); },
    });
    expect(out).toBe(FALLBACK_REPOS);
  });

  it("falls back on non-ok response", async () => {
    const out = await fetchRepos("mhh11222", {
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });
    expect(out).toBe(FALLBACK_REPOS);
  });

  it("falls back when payload is not a non-empty array", async () => {
    const out = await fetchRepos("mhh11222", { fetchImpl: okFetch([]) });
    expect(out).toBe(FALLBACK_REPOS);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/repos.test.js`
Expected: FAIL — `fetchRepos` 미정의.

- [ ] **Step 3: 구현 추가**

`src/repos.js` 에 추가:
```javascript
export async function fetchRepos(user, { fetchImpl = globalThis.fetch, signal } = {}) {
  try {
    const res = await fetchImpl(
      `https://api.github.com/users/${user}/repos?sort=updated&per_page=100`,
      { signal, headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res || !res.ok) return FALLBACK_REPOS;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return FALLBACK_REPOS;
    const picked = pickRepos(data.map(normalizeRepo));
    return picked.length ? picked : FALLBACK_REPOS;
  } catch {
    return FALLBACK_REPOS;
  }
}
```

- [ ] **Step 4: 통과 확인 + 회귀**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**
```bash
git add src/repos.js tests/repos.test.js
git commit -m "feat(repos): fetchRepos with graceful fallback"
```

---

## Task 7: `nodes.js` — 지형 위 레포 노드 빌드

**Files:**
- Create: `src/nodes.js`
- Test: `tests/nodes.test.js`

> Three.js 렌더 코드라 로직 일부만 단위테스트(데이터→배치). 시각은 Task 9 스모크.

- [ ] **Step 1: 실패 테스트 작성**

`tests/nodes.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { nodePlacements } from "../src/nodes.js";

describe("nodePlacements", () => {
  it("maps each repo to a world position above the surface", () => {
    const repos = [{ name: "alpha" }, { name: "beta" }];
    const out = nodePlacements(repos);
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.repo).toBeDefined();
      expect(typeof p.world.x).toBe("number");
      expect(typeof p.world.y).toBe("number"); // up axis (above surface)
      expect(typeof p.world.z).toBe("number");
      expect(p.world.y).toBeGreaterThan(0); // floats above terrain
    }
  });
  it("is deterministic", () => {
    const a = nodePlacements([{ name: "alpha" }]);
    const b = nodePlacements([{ name: "alpha" }]);
    expect(a[0].world).toEqual(b[0].world);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/nodes.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현 — 배치 로직(순수) + 빌더(THREE 주입)**

`src/nodes.js`:
```javascript
// src/nodes.js — 레포를 지형 위 떠 있는 노드로. 배치는 순수, 렌더는 THREE 주입.
import { repoToObjective } from "./repos.js";
import { objToWorld, fitnessAt } from "./landscape.js";

const HOVER = 0.34; // 표면 위로 띄우는 높이(월드)

// 순수: 각 repo의 월드 좌표(표면 fitness 높이 + HOVER).
export function nodePlacements(repos) {
  return (repos || []).map((repo) => {
    const { x, y } = repoToObjective(repo);
    const w = objToWorld(x, y); // {x, z} 평면 (y=표면높이 별도)
    const h = fitnessAt(x, y);  // 0..1 표면 높이
    return { repo, obj: { x, y }, world: { x: w.x, y: h + HOVER, z: w.z } };
  });
}

// THREE를 주입받아 노드 그룹을 만든다. 각 메쉬.userData.repo로 레이캐스트에서 식별.
export function buildRepoNodes(THREE, repos, { color = 0x5eeaff } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.045, 0);
  for (const p of nodePlacements(repos)) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.world.x, p.world.y, p.world.z);
    mesh.userData.repo = p.repo;
    // 가는 수직선으로 표면에 앵커(지형 위 떠 있음을 명확히)
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p.world.x, p.world.y, p.world.z),
        new THREE.Vector3(p.world.x, p.world.y - 0.28, p.world.z),
      ]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    );
    group.add(mesh);
    group.add(stem);
  }
  return group;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/nodes.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**
```bash
git add src/nodes.js tests/nodes.test.js
git commit -m "feat(nodes): repo node placement (pure) + THREE builder"
```

---

## Task 8: `#repo-panel` DOM + 스타일

**Files:**
- Modify: `index.html` (메인 콘텐츠 블록 근처, 커서 리티클 아래)
- Modify: `styles/main.css` (파일 끝)

- [ ] **Step 1: 패널 DOM 추가**

`index.html` 의 커서 리티클/좌표 블록(`<!-- cursor reticle -->` 부근, 라인 ~110) 바로 아래에 추가:
```html
    <!-- repo node info panel (hidden until a project node is clicked) -->
    <aside id="repo-panel" class="repo-panel" hidden aria-live="polite">
      <button class="repo-panel-close" type="button" aria-label="Close">×</button>
      <div class="repo-panel-lang" id="repo-panel-lang"></div>
      <h2 class="repo-panel-name" id="repo-panel-name"></h2>
      <p class="repo-panel-desc" id="repo-panel-desc"></p>
      <div class="repo-panel-meta" id="repo-panel-meta"></div>
      <a class="repo-panel-link" id="repo-panel-link" href="#" target="_blank" rel="noopener">
        OPEN ON GITHUB →
      </a>
    </aside>
```

- [ ] **Step 2: 스타일 추가**

`styles/main.css` 끝에 추가(DESIGN.md 팔레트 사용 — 시안 `--aurora`, 본문 `--bone`, 패널 `--surface`):
```css
/* ---- repo node info panel ---- */
.repo-panel {
  position: fixed;
  right: 24px;
  bottom: 120px;
  z-index: 30;
  width: min(340px, 80vw);
  padding: 18px 20px 20px;
  background: rgba(6, 10, 15, 0.82);
  border: 1px solid var(--aurora);
  border-radius: 4px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 0 32px rgba(94, 234, 255, 0.18);
  color: var(--bone);
  font-family: "JetBrains Mono", monospace;
  animation: panelin 0.3s var(--ease-out);
}
.repo-panel[hidden] { display: none; }
@keyframes panelin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.repo-panel-close {
  position: absolute; top: 8px; right: 10px;
  background: none; border: none; color: var(--mute);
  font-size: 1.3rem; line-height: 1; cursor: pointer;
}
.repo-panel-close:hover { color: var(--aurora); }
.repo-panel-lang { font-size: 0.7rem; letter-spacing: 0.12em; color: var(--aurora); text-transform: uppercase; }
.repo-panel-name { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 1.15rem; margin: 6px 0 8px; color: var(--bone); }
.repo-panel-desc { font-size: 0.82rem; line-height: 1.5; color: var(--bone); opacity: 0.85; margin: 0 0 10px; }
.repo-panel-meta { font-size: 0.72rem; color: var(--mute); letter-spacing: 0.04em; margin-bottom: 12px; }
.repo-panel-link { font-size: 0.74rem; letter-spacing: 0.08em; color: var(--aurora); text-decoration: none; }
.repo-panel-link:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { .repo-panel { animation: none; } }
```

- [ ] **Step 3: 문법/렌더 확인**

Run: `python3 -m http.server 8080` → 페이지가 깨지지 않고 패널은 숨김 상태(`hidden`).

- [ ] **Step 4: 커밋**
```bash
git add index.html styles/main.css
git commit -m "feat(nodes): repo info panel DOM + styles (hidden)"
```

---

## Task 9: main.js 배선 — 노드 마운트·클릭 fly-to·패널

**Files:**
- Modify: `src/main.js`

> main.js는 모듈 import 후 Three.js scene/camera/world 그룹을 만들고 RAF 루프를 돈다. 아래는 그 구조에 얹는다. **정확한 변수명(scene/camera/world 그룹·renderer)은 main.js 현재 코드에서 확인 후 일치**시킨다(예: 월드 그룹이 `world`/`rig`/`scene` 중 무엇인지). 노드는 지형과 같은 그룹에 add해 같은 변환을 받게 한다.

- [ ] **Step 1: import 추가**

`src/main.js` 상단 import 블록에 추가:
```javascript
import { fetchRepos } from "./repos.js";
import { buildRepoNodes } from "./nodes.js";
```

- [ ] **Step 2: 노드 마운트(지형 준비 후, 1회)**

지형(`buildSurface`/`buildField`)을 월드 그룹에 add하는 코드 근처에서, 같은 그룹에 비동기로 노드를 추가:
```javascript
// repo nodes — 비동기 로드, 실패해도 폴백. 지형 그룹(<WORLD_GROUP>)에 부착.
let repoNodes = null;
const raycaster = new THREE.Raycaster();
fetchRepos("mhh11222").then((repos) => {
  repoNodes = buildRepoNodes(THREE, repos);
  <WORLD_GROUP>.add(repoNodes); // 지형과 동일 그룹: 같은 회전/스케일 상속
});
```
`<WORLD_GROUP>` = 지형 메쉬가 들어가는 실제 그룹 변수로 교체.

- [ ] **Step 3: 클릭 → 가장 가까운 노드 → fly-to + 패널**

이벤트 핸들러 추가(파일 내 다른 DOM 이벤트 등록부 근처):
```javascript
const panel = document.getElementById("repo-panel");
function showPanel(repo) {
  document.getElementById("repo-panel-lang").textContent = repo.lang || "—";
  document.getElementById("repo-panel-name").textContent = repo.name;
  document.getElementById("repo-panel-desc").textContent = repo.desc || "";
  document.getElementById("repo-panel-meta").textContent =
    `★ ${repo.stars}  ·  updated ${(repo.updated || "").slice(0, 10)}`;
  const link = document.getElementById("repo-panel-link");
  link.href = repo.url; 
  panel.hidden = false;
}
function hidePanel() { panel.hidden = true; }
panel.querySelector(".repo-panel-close").addEventListener("click", hidePanel);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePanel(); });

let flyTarget = null; // {x,y,z} 카메라 룩/도착 보간 타깃
renderer.domElement.addEventListener("click", (e) => {
  if (!repoNodes) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const meshes = repoNodes.children.filter((c) => c.userData && c.userData.repo);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return;
  const repo = hit.object.userData.repo;
  showPanel(repo);
  flyTarget = hit.object.getWorldPosition(new THREE.Vector3());
});
```

- [ ] **Step 4: RAF에서 fly-to 카메라 보간(있을 때)**

메인 RAF 루프 안, 카메라 갱신부에 추가(기존 ambient 카메라 모션과 공존; reduced-motion이면 즉시 스냅):
```javascript
if (flyTarget) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const k = reduce ? 1 : 0.06;
  camera.position.lerp(
    new THREE.Vector3(flyTarget.x, flyTarget.y + 0.6, flyTarget.z + 1.4), k,
  );
  camera.lookAt(flyTarget);
}
```

> NOTE: 기존 루프가 매 프레임 `camera.lookAt`/위치를 강제로 덮어쓰면 충돌한다. 그 경우 `flyTarget` 활성 동안 기존 ambient 카메라 갱신을 `if (!flyTarget)`로 가드한다. main.js의 카메라 갱신 위치를 읽고 분기하라.

- [ ] **Step 5: 임포트/문법 확인**

Run: `node --check src/main.js`
Expected: 에러 없음(ESM import 경고는 무시 가능; 실패 시 문법만 수정).

- [ ] **Step 6: 전체 회귀**

Run: `npm test`
Expected: 무회귀(노드 배선은 main.js라 단위 비대상, repos/nodes 단위는 통과 유지).

- [ ] **Step 7: 라이브 스모크**

Run: `python3 -m http.server 8080` → 포털 진입 → 지형 위에 시안 노드 몇 개가 떠 있고, 클릭하면 카메라가 그쪽으로 부드럽게 이동 + 우측 패널에 레포 이름/설명/링크. ESC·× 닫힘. (오프라인이면 폴백 1노드.)

- [ ] **Step 8: 커밋 + 배포**
```bash
git add src/main.js
git commit -m "feat(nodes): mount repo nodes, raycast click → fly-to + info panel"
git push
```

---

# PHASE 3 — SEO/OG · i18n 토글 (P5)

## Task 10: OG 이미지 생성 (sips)

**Files:**
- Create: `assets/og.jpg`

- [ ] **Step 1: 1200×630 카드 생성**

Run:
```bash
cd ~/Desktop/moon-ai-tower
# 초상을 630 높이로 맞춘 뒤 1200×630 검정 캔버스에 패딩(얼굴 카드)
cp assets/portrait.png /tmp/og-src.png
sips -s format jpeg -s formatOptions 80 \
  --resampleHeight 630 \
  --padToHeightWidth 630 1200 --padColor 000000 \
  /tmp/og-src.png --out assets/og.jpg
sips -g pixelWidth -g pixelHeight assets/og.jpg
ls -lh assets/og.jpg
```
Expected: 1200×630 JPEG, < 300KB. (`--padColor`가 거부되면 `--padColor 000000` 위치를 옵션 끝으로 옮기거나 검정 배경 PNG에 합성으로 재시도.)

- [ ] **Step 2: 커밋**
```bash
git add assets/og.jpg
git commit -m "feat(seo): 1200x630 OG card image"
```

---

## Task 11: SEO/OG/Twitter/JSON-LD 메타

**Files:**
- Modify: `index.html` `<head>` (기존 description 아래, stylesheet 위)

- [ ] **Step 1: 메타 태그 추가**

`index.html`의 `<meta name="description" ...>` 바로 아래에 추가(라이브 URL 절대경로 사용):
```html
    <link rel="canonical" href="https://mhh11222.github.io/hohyunmoon-pr-ai-tower/" />
    <meta name="theme-color" content="#000000" />
    <meta name="author" content="Hohyun Moon" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Hohyun Moon — Full-stack engineer & genetic-algorithm researcher" />
    <meta property="og:description" content="A live WebGL render of a genetic algorithm evolving in objective space. Full-stack engineer building agentic AI systems." />
    <meta property="og:url" content="https://mhh11222.github.io/hohyunmoon-pr-ai-tower/" />
    <meta property="og:image" content="https://mhh11222.github.io/hohyunmoon-pr-ai-tower/assets/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Hohyun Moon — Full-stack engineer & genetic-algorithm researcher" />
    <meta name="twitter:description" content="A live WebGL render of a genetic algorithm evolving in objective space." />
    <meta name="twitter:image" content="https://mhh11222.github.io/hohyunmoon-pr-ai-tower/assets/og.jpg" />

    <!-- JSON-LD: Person -->
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": "Hohyun Moon",
        "alternateName": "문호현",
        "jobTitle": "Full-stack engineer & genetic-algorithm researcher",
        "url": "https://mhh11222.github.io/hohyunmoon-pr-ai-tower/",
        "sameAs": ["https://github.com/mhh11222"]
      }
    </script>
```

- [ ] **Step 2: HTML 유효성/렌더 확인**

Run: `python3 -m http.server 8080` → 콘솔 에러 없음, 페이지 정상.
공유 미리보기 검증(배포 후): `https://www.opengraph.xyz/` 또는 Slack/카톡에 링크 붙여 카드 확인.

- [ ] **Step 3: 커밋**
```bash
git add index.html
git commit -m "feat(seo): OG/Twitter/canonical/JSON-LD meta + theme-color"
```

---

## Task 12: `i18n.js` — 언어 감지·영속·적용 (TDD)

**Files:**
- Create: `src/i18n.js`
- Test: `tests/i18n.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/i18n.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import { detectLang, applyLang } from "../src/i18n.js";

const store = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
};

describe("detectLang", () => {
  it("prefers stored choice", () => {
    expect(detectLang({ language: "en-US" }, store({ "moon-ai-tower:lang": "ko" }))).toBe("ko");
  });
  it("falls back to navigator (ko)", () => {
    expect(detectLang({ language: "ko-KR" }, store())).toBe("ko");
  });
  it("defaults to en for non-korean", () => {
    expect(detectLang({ language: "fr-FR" }, store())).toBe("en");
  });
  it("survives missing navigator", () => {
    expect(detectLang(undefined, store())).toBe("en");
  });
});

describe("applyLang", () => {
  it("sets html lang, body data-lang, and persists", () => {
    const html = { lang: "" };
    const body = { dataset: {} };
    const doc = { documentElement: html, body };
    const s = store();
    applyLang("ko", { doc, store: s });
    expect(html.lang).toBe("ko");
    expect(body.dataset.lang).toBe("ko");
    expect(s.getItem("moon-ai-tower:lang")).toBe("ko");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/i18n.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`src/i18n.js`:
```javascript
// src/i18n.js — 한/영 토글. 순수: 감지·적용. CSS가 body[data-lang]로 표시 제어.
const KEY = "moon-ai-tower:lang";

export function detectLang(nav, store) {
  const saved = store && store.getItem(KEY);
  if (saved === "en" || saved === "ko") return saved;
  const lang = (nav && nav.language) || "en";
  return lang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function applyLang(lang, { doc = document, store = localStorage } = {}) {
  const l = lang === "ko" ? "ko" : "en";
  doc.documentElement.lang = l;
  doc.body.dataset.lang = l;
  try { store.setItem(KEY, l); } catch { /* private mode */ }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/i18n.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**
```bash
git add src/i18n.js tests/i18n.test.js
git commit -m "feat(i18n): detectLang + applyLang (pure, persisted)"
```

---

## Task 13: 언어 토글 버튼 + CSS 표시 규칙 + 배선

**Files:**
- Modify: `index.html` (HUD에 토글 버튼)
- Modify: `styles/main.css` (body[data-lang] 표시 + 토글 스타일)
- Modify: `src/main.js` (i18n 초기화·이벤트)

- [ ] **Step 1: 토글 버튼 DOM**

`index.html`의 텔레메트리/스크롤힌트 HUD 근처(우상단 빈 공간)에 추가:
```html
    <!-- language toggle -->
    <div class="lang-toggle" role="group" aria-label="Language">
      <button type="button" data-lang="en" aria-pressed="true">EN</button>
      <button type="button" data-lang="ko" lang="ko" aria-pressed="false">한</button>
    </div>
```

- [ ] **Step 2: CSS — 활성 언어만 표시 + 토글 스타일**

`styles/main.css` 끝에 추가. 기본은 EN, `data-lang="ko"`면 KO만:
```css
/* ---- language toggle: show only active language ---- */
body[data-lang="en"] .ko { display: none !important; }
body[data-lang="ko"] .en { display: none !important; }
/* ko가 활성일 때 ko를 본문 위상으로(서브 스타일 상쇄) */
body[data-lang="ko"] .titleblock .tagline .ko,
body[data-lang="ko"] .titleblock .herostatement .ko { color: var(--bone); font-size: 1em; opacity: 0.92; }
body[data-lang="ko"] .titleblock .person-ko { color: var(--bone); }

.lang-toggle {
  position: fixed; top: 20px; right: 24px; z-index: 30;
  display: inline-flex; gap: 2px;
  font: 700 0.7rem "JetBrains Mono", monospace; letter-spacing: 0.08em;
}
.lang-toggle button {
  background: rgba(6, 10, 15, 0.6); color: var(--mute);
  border: 1px solid rgba(94, 234, 255, 0.25); padding: 5px 9px; cursor: pointer;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.lang-toggle button[aria-pressed="true"] { color: var(--ink); background: var(--aurora); border-color: var(--aurora); }
.lang-toggle button:focus-visible { outline: 2px solid var(--aurora); outline-offset: 2px; }
```

- [ ] **Step 3: main.js 배선**

`src/main.js` 상단 import에 추가:
```javascript
import { detectLang, applyLang } from "./i18n.js";
```
초기화 블록(DOM 준비 후, decode 시작 전 권장)에 추가:
```javascript
const langToggle = document.querySelector(".lang-toggle");
function syncLangButtons(lang) {
  langToggle.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}
{
  const initial = detectLang(navigator, localStorage);
  applyLang(initial, {});
  syncLangButtons(initial);
  langToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    applyLang(btn.dataset.lang, {});
    syncLangButtons(btn.dataset.lang);
  });
}
```

> decode 효과는 `.titleblock .decode`(=`.en`)에 걸린다. KO 활성 시 그 요소는 숨겨지므로 decode는 무해하게 진행된다(KO엔 decode 없음 — 의도된 단순화, 리뷰에서 재검토 가능).

- [ ] **Step 4: 문법 확인 + 회귀**

Run: `node --check src/main.js && npm test`
Expected: 문법 OK, 전체 PASS(i18n 단위 포함).

- [ ] **Step 5: 라이브 스모크**

Run: `python3 -m http.server 8080` → 우상단 EN/한 토글. KO 누르면 모든 카피가 한국어 단독, EN 누르면 영어 단독. 새로고침해도 선택 유지(localStorage). 한국어 브라우저면 첫 진입이 한.

- [ ] **Step 6: 커밋 + 배포**
```bash
git add index.html styles/main.css src/main.js
git commit -m "feat(i18n): EN/KO toggle — HUD button, data-lang CSS, persisted"
git push
```

---

## Task 14: 최종 통합 검증 + 세션로그

**Files:**
- Create: `docs/2026-06-27_세션로그_perf-nodes-seo.md`

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 기존 46 + assets 3 + repos + nodes + i18n = 전부 PASS.

- [ ] **Step 2: 라이브 종합 스모크**

`http://localhost:8080`에서 한 번에 확인: (1) 빠른 첫 로딩(네트워크 탭 총 전송 ~4MB대), (2) 포털→지형 전환 정상, (3) 레포 노드 클릭 fly-to+패널, (4) EN/KO 토글, (5) 링크 공유 카드(배포 후 opengraph.xyz), (6) reduced-motion 환경(OS "동작 줄이기")에서 애니메이션 정지·노드 스냅.

- [ ] **Step 3: 세션로그 작성 + 커밋**

`docs/2026-06-27_세션로그_perf-nodes-seo.md`에 변경 요약(자산 용량 전후, 신규 모듈, 남은 로드맵: 커스텀 도메인·포털 전환 튜닝·노드 라벨 상시표시 등) 기록.
```bash
git add docs/2026-06-27_세션로그_perf-nodes-seo.md
git commit -m "docs: 2026-06-27 session log — perf/nodes/seo/i18n"
git push
```

---

## Self-Review (작성자 점검)

**Spec coverage:** (1) 성능 = Task 1–3(오디오 m4a·초상 리사이즈·예산 테스트). (2) P3 노드 = Task 4–9(디스커버리·repos 순수·fetch폴백·nodes·패널·main 배선 fly-to). (3) P5 = Task 10–13(OG이미지·메타/JSON-LD·i18n 순수·토글 배선). 통합 = Task 14. 전 항목 매핑됨.

**Placeholder scan:** 코드 스텝 전부 실코드. 단 두 군데가 **라이브 관찰/현장 변수 의존**으로 명시됨: `FALLBACK_REPOS` 내용(Task 4 디스커버리로 채움)과 main.js의 `<WORLD_GROUP>`/카메라 갱신 충돌 가드(현 main.js 변수명 확인 후 일치). 이는 placeholder가 아니라 기존 코드 적응 지점이며 게이트로 분리됨.

**Type consistency:** `normalizeRepo` 출력 {name,desc,url,lang,stars,updated,fork} ↔ `pickRepos`/`fetchRepos`/`showPanel` 사용 일치. `repoToObjective`→{x,y} ↔ `nodePlacements`→`objToWorld(x,y)`/`fitnessAt(x,y)` 일치. `detectLang`/`applyLang` 시그니처 Task12=Task13 일치. localStorage 키 `moon-ai-tower:lang` 단일. 자산 경로 `./assets/ambient.m4a`·`./assets/og.jpg` 일관.

**알려진 의존:** Task 2 `afconvert -b` 비트레이트 플래그·Task 10 `sips --padColor`는 macOS 버전차로 거부 가능 → 각 스텝에 대체 명령 병기. Task 9는 main.js의 실제 그룹/카메라 구조에 맞춰야 함(읽고 적응).

---

## GSTACK REVIEW REPORT (/autoplan — 2026-06-27)

코덱스 미설치 → 각 페이즈 **Claude 독립 서브에이전트 보이스 1종**(codex 보이스 unavailable). UI 스코프=YES(Design 실행), DX 스코프=NO(사람 방문자용 포트폴리오, DX 생략). 3개 보이스가 **사전 맥락 없이** 독립 평가 후 합의.

### 합의표 (Codex=N/A, 단일 보이스)

**CEO (전략·스코프)**
| 차원 | Claude | 판정 |
|---|---|---|
| 1 전제 타당? | NO | "25MB→4MB 첫 로딩"은 거짓(오디오는 이미 `preload="none"` 지연로드) |
| 2 옳은 문제? | PARTIAL | 초상 압축·SEO는 실익, but 최고 레버(읽을 수 있는 케이스스터디)는 미포함 |
| 3 스코프 보정? | NO | Phase 2 과대빌드(빈 페이로드), 오디오 존재가치 미검토 |
| 4 대안 탐색? | NO | 라이브API vs 큐레이션, 압축 vs CDN, 커스텀도메인 미평가 |
| 5 경쟁 리스크? | NO | WebGL-only → 크롤러·스크린리더에 콘텐츠 안 보임 |
| 6 6개월 궤적? | PARTIAL | 로딩·공유카드는 잘 늙음; 라이브노드·github.io SEO는 후회 예약 |

**Design (7차원 요지, 완성도 5/10)**
| 차원 | 판정 |
|---|---|
| 위계가 히어로를 살리나 | PARTIAL — 패널/토글 배치는 균형, but 노드가 입자필드에 위장(동색·동스케일·라벨 미빌드) |
| 상태 명세 | NO — 로딩/스태거·호버·클릭가능단서·모바일패널·fly-to 복귀 전부 누락 |
| 토글 패러다임 | PARTIAL — 일언어 전환은 타당, but KO 포털 위계 붕괴 + decode 비트 상실 |
| 모션/인터랙션 | NO — fly-to가 잘못된 좌표프레임의 raw lerp, 복귀 없음, rig가 밑에서 계속 회전 |
| 디자인시스템 정합 | PARTIAL — 패널 OK; 토글 active 솔리드필·노드 색이 토큰 이탈 |
| 구체적(비일반) | PARTIAL — 코드는 구체적이나 일부가 사실 오류(objToWorld arity, up축) |

**Eng (6차원)**
| 차원 | 판정 |
|---|---|
| 1 아키텍처 | PARTIAL — `nodes.js`가 존재하지 않는 `objToWorld(x,y)`/Y-up에 코딩됨(실제는 `objToWorld(o)` 스칼라, Z-up, ×1.45) |
| 2 테스트 충분 | PARTIAL — repos/i18n는 견고, but 초상 테스트가 알파(명시된 리스크) 미검증, nodePlacements 테스트가 구현과 모순 |
| 3 성능 접근 | YES — afconvert AAC + sips PNG 리사이즈는 옳고 큰 win |
| 4 순수로직 정합 | PARTIAL — repos.js·i18n.js 정확; nodes.js 배치는 깨짐 |
| 5 통합/에러경로 | NO — fly-to가 flyTarget 미해제, main.js:587 카메라덮어쓰기·:583 rig회전과 충돌, 모듈스코프 wiring은 ReferenceError |
| 6 배포 리스크 | YES — 상대경로·.m4a MIME·OG 절대URL 전부 Pages에 적합 |

### CONFIRMED 기술 결함 (3보이스 전원 일치 → 승인 시 자동 수정)
- **T1 [critical] 노드 좌표 API 불일치:** 실제 `landscape.js:60` = `objToWorld(o)=o*2-1`(스칼라). 높이는 **+Z축**·`Z_SCALE=1.45`(`field.js:23`). 플랜의 `objToWorld(x,y)→{x,z}`+Y-up은 거짓 → 노드 NaN/옆으로 뜸, **자체 테스트가 버그를 통과시킴**. 수정: `wx=objToWorld(ox), wz=objToWorld(oy), y=fitnessAt*Z_SCALE+HOVER` (실제 축으로), 테스트도 교정.
- **T2 [critical] fly-to 복귀 없음 + 카메라루프 충돌:** 실루프가 매프레임 `camera.position.z`(`main.js:587`)·`rig.rotation.z`(`:583`) 덮어씀. `hidePanel`이 `flyTarget` 미해제 → 카메라 영구 정박·ambient 영구 정지. 수정: close/ESC에서 `flyTarget=null`+홈복귀 lerp, fly중 rig freeze, 타깃 매프레임 재계산.
- **T3 [high] 모듈 스코프:** `scene/camera/world`는 `runThree()` **내부 지역변수**. Task9 코드는 반드시 runThree() 안 `world.add(...)` 뒤에 둬야 함(아니면 ReferenceError). `<WORLD_GROUP>`=`world`.
- **T4 [med] 초상 알파 미검증:** 테스트가 용량만 봄 → 알파 날아간 PNG/JPEG도 통과. `sips -g hasAlpha`/IHDR 검사 추가 + mp3 제거 검증.
- **T5 [med] i18n/노드 null 가드·중복 리스너:** `langToggle` 존재 가드, 캔버스 중복 click(이미 `main.js:217`) 정리, 노드 클릭은 포털 종료 후로 게이팅.
- **T6 [design] 노드 가독성:** 입자필드와 동색·동스케일 → 라벨 스프라이트+호버 하이라이트+구별색(thermal 등) 필요. 스태거 진입.
- **T7 [design] 토글이 KO 포털 깨뜨림:** KO 승격 CSS가 `.titleblock`만 → `.portal-name/.portal-tag .ko`도 승격. decode를 활성언어에 재실행(또는 양쪽).

### Eng가 바로잡은 안심 항목 (플랜이 맞은 것)
- GitHub rate-limit은 **방문자 IP당** 60/hr(공유 Pages IP 아님) — 우리에게 유리. `file://`도 CORS `*`로 대개 성공, 실패시 폴백 커버.
- 오디오 m4a 루프·OG 절대URL·`.nojekyll` 상대경로·배포 전부 정상. 순수로직(repos/i18n) 정확.

### USER CHALLENGES (3보이스가 사용자의 명시 방향 변경을 권고 — 자동결정 금지, 게이트로)
- **UC1 — 라이브 GitHub 노드 대신 큐레이션 프로젝트/케이스스터디.** 근거: 공개 레포는 사실상 이 사이트 1개(0★), velvoid-mentor는 비공개 → 라이브 결과 = 외로운 0★ 자기참조 노드. 게다가 노드가 히어로에 위장·a11y/SEO 불가. 권고: 라이브API 폐기, 비공개·실무 작업 포함 4~6개 카드 큐레이션(원하면 같은 3D 노드에 주입).
- **UC2 — Phase 1 성능 프레이밍 재보정.** 오디오는 이미 지연로드 → "첫 로딩 25MB→4MB"는 거짓. 첫 로딩 실레버는 **초상 리사이즈뿐**. 권고: 실제 네트워크탭으로 전후 측정·정직하게 재서술(오디오 압축은 재생경험·레포 비대 해소로).
- **UC3 — 크롤 가능한 케이스스터디+이력서 섹션 추가(신규 스코프).** 근거: WebGL-only는 크롤러·스크린리더에 안 보임 → "와우"는 있는데 읽거나 전달할 게 없음(전환 공백). 최고 레버 개선.
- **UC4 — SEO 투자 전에 커스텀 도메인.** 근거: canonical/OG가 github.io 서브패스(임대지)를 가리킴 → 옮길 수 없는 자산. 권고: `hohyunmoon.com`(~$12/yr) 먼저.

### 결정 (게이트 후 적용)
- 기술 T1~T7: **승인 시 자동 수정**(완성도 P1·명시성 P5). 단 UC1 결과가 노드 존속을 정하므로 T1/T2/T6은 UC1 확정 후 형태 결정.
- UC1~UC4: **사용자 결정 필요** → 아래 게이트.
</content>
</invoke>
