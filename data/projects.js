// data/projects.js — curated project constellation (inlined ESM, no fetch).
//   Hand-picked so the markers read as real work, not a thin public GitHub.
//   Private projects show outcome + impact, never code (url: null).
//   ⚠️ REVIEW THE COPY — outcomes are framed from current knowledge; tune freely.
//
//   Shape: { id, name, name_ko, blurb, blurb_ko, impact, tags[], url|null, private }
//   Rendered two ways from this single source:
//     1) floating thermal nodes over the landscape (src/nodes.js)
//     2) a crawlable <section id="projects"> mirror for SEO + screen readers

const projects = [
  {
    id: "velvoid-mentor",
    name: "VELVOID Mentor",
    name_ko: "VELVOID 멘토",
    blurb:
      "A self-improving AI mentor that runs a real business operator's day. Claude + RAG over a curated strategy corpus, persistent memory, and a nightly genetic algorithm that evolves its own persona and advice toward what actually moves the numbers.",
    blurb_ko:
      "사업가의 하루를 함께 운영하는 자가진화 AI 멘토. Claude + 전략 코퍼스 RAG, 영속 기억, 그리고 매일 밤 유전 알고리즘이 자신의 인격과 조언을 '실제로 숫자를 움직이는' 방향으로 진화시킨다.",
    impact:
      "Autonomous coaching loop: senses real work, verifies commitments, evolves strategy without human tuning.",
    tags: ["Agentic AI", "Genetic Algorithm", "RAG", "Python/FastAPI"],
    url: null,
    private: true,
  },
  {
    id: "ai-tower",
    name: "AI Tower",
    name_ko: "AI 타워",
    blurb:
      "This site. A genetic algorithm evolving live in objective space, rendered as a 3D fitness landscape in pure WebGL — population climbs the peaks, the Pareto front re-forms, the champion tower re-anchors, generation after generation.",
    blurb_ko:
      "지금 이 사이트. 목적공간에서 실시간으로 진화하는 유전 알고리즘을 순수 WebGL 3D 적합도 지형으로 렌더링 — 개체군이 봉우리를 오르고, 파레토 전선이 재형성되고, 챔피언 타워가 세대마다 재정착한다.",
    impact:
      "No engine, no build step — Three.js + GLSL + vanilla ESM, accessible fallbacks, fully tested.",
    tags: ["Three.js", "WebGL", "GLSL"],
    url: "https://github.com/mhh11222/hohyunmoon-pr-ai-tower",
    private: false,
  },
  {
    id: "reflective-evolution",
    name: "Reflective-Pareto Evolution",
    name_ko: "리플렉티브-파레토 진화",
    blurb:
      "The evolutionary engine behind the agents: reflective-Pareto search with Thompson sampling for exploration, plus structural-delta (ACE-style) context updates instead of rewriting whole genomes — graded on verifiable objective signals, not LLM self-scoring.",
    blurb_ko:
      "에이전트를 움직이는 진화 엔진: 탐색을 위한 톰슨 샘플링 결합 리플렉티브-파레토 탐색, 게놈 통째 재작성 대신 구조적 델타(ACE 계열) 컨텍스트 업데이트 — LLM 자기채점이 아닌 검증 가능한 객관 신호로 평가.",
    impact:
      "Avoids reward-hacking: fitness comes from real-world action outcomes, not a judge model.",
    tags: ["Evolutionary Search", "LLM Systems", "Research"],
    url: null,
    private: true,
  },
];

export default projects;
