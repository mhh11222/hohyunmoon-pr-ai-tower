// Scroll progress 0..1. P1 has a single tall hero so this stays near 0, but the
// uniform is wired (and declared in GLSL — Eng fix M3) so P2 can drive it.
export function scrollProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
