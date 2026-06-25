// GA evolution snapshot, inlined as an ESM module.
// Eng fix C1/C2: do NOT fetch("./data/evo.json") — that breaks file:// (CORS)
// and GitHub Pages subpaths. Import this module instead.
//
// P1 ships one representative generation (synthetic). P2 will add the
// multi-generation timeline + live animation. Values are deliberately spread
// across objective space so the pareto front and champion read clearly.
//
// Schema per genome: { id, obj:[0..1, 0..1], fitness:0..1, dominated:boolean }
//   obj  = position in 2D objective space (x,y), 0..1 normalized
//   fitness = scalar quality, drives z / size / brightness
//   dominated = true if another genome beats it on all objectives

const evo = {
  meta: {
    generation: 47, // shown in HUD as GEN 047
    populationLabel: "MOON-GA / objective-space snapshot",
  },
  generations: [
    {
      generation: 47,
      genomes: [
        // --- pareto front (non-dominated), spread along obj[0] ---
        { id: "g1", obj: [0.12, 0.86], fitness: 0.71, dominated: false },
        { id: "g2", obj: [0.27, 0.74], fitness: 0.83, dominated: false },
        { id: "g3", obj: [0.46, 0.63], fitness: 0.96, dominated: false }, // CHAMPION
        { id: "g4", obj: [0.61, 0.48], fitness: 0.88, dominated: false },
        { id: "g5", obj: [0.78, 0.33], fitness: 0.79, dominated: false },
        { id: "g6", obj: [0.9, 0.18], fitness: 0.66, dominated: false },
        // --- dominated interior cloud (dimmer) ---
        { id: "g7", obj: [0.22, 0.41], fitness: 0.44, dominated: true },
        { id: "g8", obj: [0.35, 0.3], fitness: 0.38, dominated: true },
        { id: "g9", obj: [0.5, 0.27], fitness: 0.49, dominated: true },
        { id: "g10", obj: [0.4, 0.52], fitness: 0.57, dominated: true },
        { id: "g11", obj: [0.6, 0.22], fitness: 0.41, dominated: true },
        { id: "g12", obj: [0.18, 0.6], fitness: 0.52, dominated: true },
        { id: "g13", obj: [0.7, 0.4], fitness: 0.6, dominated: true },
        { id: "g14", obj: [0.32, 0.18], fitness: 0.29, dominated: true },
        { id: "g15", obj: [0.55, 0.38], fitness: 0.55, dominated: true },
        { id: "g16", obj: [0.25, 0.25], fitness: 0.31, dominated: true },
        { id: "g17", obj: [0.82, 0.5], fitness: 0.62, dominated: true },
        { id: "g18", obj: [0.15, 0.32], fitness: 0.27, dominated: true },
      ],
    },
  ],
};

export default evo;
