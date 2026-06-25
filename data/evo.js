// GA evolution timeline, inlined as an ESM module.
// Eng fix C1/C2: do NOT fetch("./data/evo.json") — that breaks file:// (CORS)
// and GitHub Pages subpaths. Import this module instead.
//
// P2: this is now a MULTI-GENERATION timeline (synthetic but realistic). Across
// the run the population converges toward a Pareto front:
//   - genomes migrate in objective space toward a tightening front
//   - best fitness climbs (~0.55 → ~0.97)
//   - the non-dominated set tightens (fewer, cleaner front points)
//   - the champion (max fitness) changes a few times
// The values are generated deterministically (seeded RNG) so the data is stable
// across reloads and unit-testable.
//
// Schema per genome: { id, obj:[0..1, 0..1], fitness:0..1, dominated:boolean }
//   obj  = position in 2D objective space (x,y), 0..1 normalized
//   fitness = scalar quality, drives z / size / brightness
//   dominated = true if another genome beats it on all objectives

const GENERATIONS = 16;
const POP = 64;

// ---- tiny deterministic RNG (mulberry32) so the timeline is reproducible ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

// Pareto dominance for a 2-objective MAXIMIZE-the-front problem. We treat the
// front as the upper-right trade-off curve: a genome is dominated if some other
// genome is >= on both objectives and strictly > on at least one.
function markDominated(genomes) {
  for (const a of genomes) {
    a.dominated = genomes.some(
      (b) =>
        b !== a &&
        b.obj[0] >= a.obj[0] &&
        b.obj[1] >= a.obj[1] &&
        (b.obj[0] > a.obj[0] || b.obj[1] > a.obj[1])
    );
  }
}

// The ideal Pareto curve the population converges toward: a concave arc in the
// upper-right of objective space, obj1 = curve(obj0).
function frontCurve(x) {
  // concave: high obj1 when obj0 low, trading off; bow it outward (good front)
  return clamp01(0.94 - Math.pow(x, 1.9) * 0.82);
}

function buildGenerations() {
  const rng = mulberry32(0x9e3779b9);
  const gens = [];

  for (let gi = 0; gi < GENERATIONS; gi++) {
    const p = gi / (GENERATIONS - 1); // 0..1 progress
    // convergence: late gens hug the front (low scatter), early gens are diffuse
    const scatter = 0.34 * (1 - p) + 0.045; // 0.385 → 0.085
    const pull = 0.18 + 0.74 * p; // how strongly points are pulled to the front
    // best fitness climbs 0.55 → 0.97 with a little wobble
    const bestTarget = 0.55 + 0.42 * p;

    const genomes = [];
    for (let k = 0; k < POP; k++) {
      // spread a base parameter along the front
      const u = (k + 0.5) / POP; // 0..1 base position along obj[0]
      const fx = clamp01(u + (rng() - 0.5) * 0.16);
      const fy = frontCurve(fx);

      // start scattered toward the lower-left, pull toward the front point
      const sx = clamp01(fx - (rng() * 0.5 + 0.05) * (1 - pull));
      const sy = clamp01(fy - (rng() * 0.5 + 0.05) * (1 - pull));
      // jitter shrinks as the run converges
      const ox = clamp01(sx + (rng() - 0.5) * scatter);
      const oy = clamp01(sy + (rng() - 0.5) * scatter);

      // fitness = closeness to the ideal front (1 = on the front) scaled to the
      // generation's best target, with mild noise
      const dist = Math.hypot(ox - fx, oy - fy);
      const closeness = clamp01(1 - dist * 1.7);
      const fitness = clamp01(closeness * bestTarget + (rng() - 0.5) * 0.06);

      genomes.push({
        id: `g${gi}-${k}`,
        obj: [Number(ox.toFixed(4)), Number(oy.toFixed(4))],
        fitness: Number(fitness.toFixed(4)),
        dominated: false,
      });
    }

    // guarantee a clear, climbing champion: lift the best genome to bestTarget
    // and nudge it onto the front so the tower has a crisp home that moves.
    let champ = genomes[0];
    for (const g of genomes) if (g.fitness > champ.fitness) champ = g;
    champ.fitness = Number(clamp01(bestTarget).toFixed(4));
    // move champion onto a deterministic front point. It holds a spot for a few
    // generations, then jumps — so the champion CHANGES location a FEW times
    // over the run (a clear "handoff" beat), not every single step.
    const CHAMP_STOPS = [0.62, 0.34, 0.5, 0.28]; // discrete front homes
    const stop = CHAMP_STOPS[Math.floor(gi / 4) % CHAMP_STOPS.length];
    const cfx = clamp01(stop);
    champ.obj = [Number(cfx.toFixed(4)), Number(frontCurve(cfx).toFixed(4))];

    markDominated(genomes);
    // champion must be on the front (non-dominated)
    champ.dominated = false;

    gens.push({ generation: gi, genomes });
  }

  return gens;
}

const generations = buildGenerations();

const evo = {
  meta: {
    generation: 0,
    populationLabel: "MOON-GA / multi-objective evolution timeline",
    generationCount: generations.length,
    stepMs: 2800, // playback cadence: advance one generation per ~2.8s
  },
  generations,
};

export default evo;
