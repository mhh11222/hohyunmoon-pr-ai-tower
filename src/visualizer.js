// Compact audio-reactive bar meter for the transport dock.
//   - 16 mono bars driven by AnalyserNode.getByteFrequencyData
//   - cyan→thermal gradient, low amplitude, on-brand
//   - idles calm (flat baseline) when paused/stopped/muted
//   - respects prefers-reduced-motion: draws one static baseline, no rAF loop
//
// createVisualizer({ canvas, audio }) → { stop }

const BARS = 16;
const CYAN = [94, 234, 255];
const THERMAL = [255, 106, 61];

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(
    lerp(c1[1], c2[1], t)
  )},${Math.round(lerp(c1[2], c2[2], t))})`;
}

export function createVisualizer({ canvas, audio, reduced = false }) {
  if (!canvas) return { stop() {} };
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop() {} };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const CSS_W = canvas.clientWidth || 96;
  const CSS_H = canvas.clientHeight || 28;
  canvas.width = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  ctx.scale(dpr, dpr);

  const gap = 2;
  const bw = (CSS_W - gap * (BARS - 1)) / BARS;
  // smoothed per-bar heights for a calm, non-jittery meter
  const heights = new Array(BARS).fill(0);

  function draw() {
    ctx.clearRect(0, 0, CSS_W, CSS_H);
    const data = audio.getBins ? audio.getBins() : null;
    for (let i = 0; i < BARS; i++) {
      let target = 0.04; // idle baseline (always a faint floor)
      if (data) {
        // sample across the available bins, weight low-mid where the drone sits
        const idx = Math.floor((i / BARS) * Math.min(data.length, 28));
        target = Math.max(0.04, (data[idx] / 255) * 0.92);
      }
      // ease toward target — slow up-ramp when idle, snappier when live
      heights[i] = lerp(heights[i], target, data ? 0.35 : 0.08);
      const h = Math.max(1, heights[i] * (CSS_H - 2));
      const x = i * (bw + gap);
      const y = CSS_H - h;
      // cyan (low) → thermal (high amplitude)
      ctx.fillStyle = mix(CYAN, THERMAL, Math.min(1, heights[i] * 1.3));
      ctx.globalAlpha = data ? 0.85 : 0.3;
      ctx.fillRect(x, y, bw, h);
    }
    ctx.globalAlpha = 1;
  }

  let raf = 0;
  if (reduced) {
    // single static frame, no animation loop
    draw();
    return { stop() {} };
  }

  function loop() {
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
