# HOHYUNMOON PR AI TOWER

A single-page portfolio whose hero is a live WebGL render of a genetic algorithm: an
objective-space scatter, the Pareto front, and a "champion tower" marking the current best
genome. The page is the work — it shows multi-objective evolutionary search running, not a
screenshot of it.

Built by **Hohyun Moon (문호현)** — full-stack engineer and genetic-algorithm researcher.

## What it renders

- **Objective-space scatter** — each point is one candidate genome plotted against two
  objectives (here: cost vs. latency).
- **Pareto front** — the non-dominated set, highlighted as the trade-off frontier.
- **Champion tower** — a 3D marker on the current best, carried by the same transform as the
  field so it stays locked to its coordinate.
- **Telemetry HUD** — generation, champion fitness, and champion id, decoded in on load.
- **AETHER dock** — an ambient audio transport with an audio-reactive meter. Never autoplays;
  the WebAudio context resumes only on a user gesture.

Everything degrades: no WebGL → CSS gradient fallback; `prefers-reduced-motion` → the final
frame renders once, frozen; touch → cursor instruments drop out.

## Tech

- **Three.js** (ESM, pinned via import map) with custom **GLSL** shaders for the field and
  Pareto/tower pulses.
- **Vanilla JavaScript**, ES modules, no build step. Data is inlined as ESM (`data/evo.js`) —
  no `fetch`, so it runs from `file://` or any static host.
- **WebAudio** for the AETHER dock and its analyser-driven visualizer.
- **Vitest** for the GA core (`tests/ga.test.js`).
- Ships as static files on **GitHub Pages** (`.nojekyll`).

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Tests:

```bash
npx vitest run
```

## Layout

```
index.html        # hero, HUD, AETHER dock, contact
styles/main.css   # mission-control design system, tokens, responsive rules
src/main.js       # Three.js wiring, telemetry, cursor probe, audio bootstrap
src/field.js      # field / grid / Pareto / tower geometry + shaders
src/ga.js         # GA helpers (championOf, domination) — unit-tested
src/decode.js     # machine-decode/typewriter text effect
src/audio.js      # AETHER transport + WebAudio graph
src/visualizer.js # audio-reactive meter
data/evo.js       # inlined generation data (ESM)
```

## About

Hohyun Moon designs and ships agentic AI systems end to end. His main project, **VELVOID**, is
a self-improving AI mentor: its persona-and-strategy genome re-optimizes nightly through
reflective-Pareto search and Thompson-sampling bandits, grounded in a RAG corpus over
Postgres/pgvector. The stack is FastAPI + Supabase + Anthropic Claude, deployed on Render with
a GitHub Actions cron driving the nightly evolution step. Working range: Python/FastAPI,
Three.js/WebGL/GLSL, Postgres and vector search, LLM agents, and evolutionary optimization.

- GitHub: [github.com/mhh11222](https://github.com/mhh11222)
- Email: door@smilewide.co.kr

---

## 소개 (한국어)

전략이 스스로 진화하는 에이전트 AI를 설계하고, 끝까지 직접 만든다. 대표 프로젝트
**VELVOID**는 자기 개선형 AI 멘토다. 인격·전략 게놈이 매일 밤 reflective-Pareto 탐색과
Thompson 샘플링 밴딧으로 다시 최적화되고, Postgres/pgvector 위의 RAG 코퍼스에 근거를 둔다.
구성은 FastAPI + Supabase + Anthropic Claude이고, Render에 배포해 GitHub Actions cron이 밤마다
진화 한 세대를 돌린다.

이 페이지의 히어로는 그 탐색을 실제로 그린 WebGL 화면이다. 목적 공간 산포, Pareto 프런트,
현재 최적 게놈을 가리키는 챔피언 타워가 매 프레임 렌더된다. 빌드 단계 없는 순수 ESM이라
정적 호스팅 어디서나 그대로 돈다.

실행: `python3 -m http.server 8080` 후 `http://localhost:8080`.
