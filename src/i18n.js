// src/i18n.js — EN/KO toggle. Pure: detect + apply. CSS drives visibility via
// body[data-lang]; both languages have full parity (decode + portal promotion).
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
  try {
    store.setItem(KEY, l);
  } catch {
    /* private mode: ignore */
  }
}
