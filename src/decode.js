// Machine decode/typewriter effect: random glyphs settle into the final text,
// staggered across elements. Respects prefers-reduced-motion (instant final).

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·/#[]<>=+*";

const reduced =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function rand(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += ch === " " || ch === "\n" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}

/**
 * Decode a single element's text. `final` defaults to the element's
 * data-decode attribute (or current textContent).
 */
export function decodeElement(el, final, { duration = 700, delay = 0 } = {}) {
  const target = final ?? el.getAttribute("data-decode") ?? el.textContent;
  if (reduced) {
    el.textContent = target;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      const start = performance.now();
      const settleOrder = [...Array(target.length).keys()].sort(() => Math.random() - 0.5);
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const settled = Math.floor(t * target.length);
        const lockedSet = new Set(settleOrder.slice(0, settled));
        let out = "";
        for (let i = 0; i < target.length; i++) {
          const ch = target[i];
          if (ch === " " || ch === "\n" || lockedSet.has(i)) out += ch;
          else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (t < 1) requestAnimationFrame(frame);
        else {
          el.textContent = target;
          resolve();
        }
      }
      requestAnimationFrame(frame);
    }, delay);
  });
}

/**
 * Decode a list of elements with a stagger between them (80-150ms).
 */
export function decodeSequence(els, { stagger = 110, duration = 650 } = {}) {
  els.forEach((el, i) => {
    decodeElement(el, undefined, { duration, delay: i * stagger });
  });
}
