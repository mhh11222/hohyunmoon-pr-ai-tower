// Monospace axis labels for the instrument chart. These are DOM overlays
// positioned along the bottom (x) and left (y) edges of the canvas so they
// read as real chart tick labels without re-projecting per frame.

export function buildAxisLabels(container) {
  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  Object.assign(wrap.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2",
    pointerEvents: "none",
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: "0.62rem",
    letterSpacing: "0.08em",
    color: "rgba(94,234,255,0.55)",
  });

  // x-axis title (bottom-centre)
  const xTitle = label("OBJ-X  →  COST", { left: "50%", bottom: "14px", transform: "translateX(-50%)" });
  // y-axis title (left, rotated)
  const yTitle = label("OBJ-Y  →  LATENCY", {
    left: "14px",
    top: "50%",
    transform: "translateY(-50%) rotate(-90deg)",
    transformOrigin: "left center",
  });

  // tick value labels along the bottom and left
  const ticksX = document.createElement("div");
  const ticksY = document.createElement("div");
  const vals = ["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"];
  vals.forEach((v, i) => {
    const fx = 0.08 + (i / (vals.length - 1)) * 0.84; // span ~middle of viewport
    const tx = label(v, { left: fx * 100 + "%", bottom: "30px", transform: "translateX(-50%)", opacity: "0.5" });
    ticksX.appendChild(tx);
    const ty = label(v, { left: "30px", top: (1 - fx) * 100 + "%", transform: "translateY(-50%)", opacity: "0.5" });
    ticksY.appendChild(ty);
  });

  wrap.append(xTitle, yTitle, ticksX, ticksY);
  container.appendChild(wrap);
  return wrap;
}

function label(text, style) {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, { position: "fixed", whiteSpace: "nowrap" }, style);
  return el;
}
