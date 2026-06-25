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

  // 3D fitness-landscape axis titles: two objective axes on the floor + the
  // FITNESS↑ riser. Positioned to frame the iso surface, not re-projected/frame.
  const xTitle = label("OBJ-X →", { left: "62%", bottom: "20px", transform: "translateX(-50%)" });
  const yTitle = label("← OBJ-Y", { left: "22%", bottom: "40px", transform: "translateX(-50%)" });
  // vertical fitness axis (left riser), rotated
  const zTitle = label("FITNESS ↑", {
    left: "16px",
    top: "44%",
    transform: "translateY(-50%) rotate(-90deg)",
    transformOrigin: "left center",
  });

  // faint fitness tick values up the left riser
  const ticksZ = document.createElement("div");
  const vals = ["0.0", "0.5", "1.0"];
  vals.forEach((v, i) => {
    const fy = 0.3 + (i / (vals.length - 1)) * 0.4;
    const tz = label(v, { left: "34px", top: (1 - fy) * 100 + "%", transform: "translateY(-50%)", opacity: "0.45" });
    ticksZ.appendChild(tz);
  });

  wrap.append(xTitle, yTitle, zTitle, ticksZ);
  container.appendChild(wrap);
  return wrap;
}

function label(text, style) {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, { position: "fixed", whiteSpace: "nowrap" }, style);
  return el;
}
