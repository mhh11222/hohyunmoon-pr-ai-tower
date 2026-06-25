// Ambient BGM manager.
//   - default MUTED, never autoplays
//   - tolerant of a missing /assets/ambient.mp3 (guarded; never breaks page)
//   - persists mute state in localStorage
//   - prefers-reduced-motion → never auto-starts (we never auto-start anyway)

const SRC = "./assets/ambient.mp3";
const KEY = "moon-ai-tower:sound";

export function createSound({ button, icon, label }) {
  let audio = null;
  let playing = false;
  let available = true; // assume yes until a load error proves otherwise

  function ensureAudio() {
    if (audio) return audio;
    try {
      audio = new Audio(SRC);
      audio.loop = true;
      audio.volume = 0.45;
      audio.preload = "none";
      audio.addEventListener("error", () => {
        // missing file → disable gracefully, never throw
        available = false;
        setOff("UNAVAILABLE");
      });
    } catch (_) {
      available = false;
    }
    return audio;
  }

  function setOn() {
    playing = true;
    button.setAttribute("aria-pressed", "true");
    if (icon) icon.textContent = "◑";
    if (label) label.textContent = "SOUND ON";
    try {
      localStorage.setItem(KEY, "on");
    } catch (_) {}
  }

  function setOff(text) {
    playing = false;
    button.setAttribute("aria-pressed", "false");
    if (icon) icon.textContent = "◐";
    if (label) label.textContent = text || "SOUND OFF";
    try {
      localStorage.setItem(KEY, "off");
    } catch (_) {}
  }

  async function toggle() {
    if (!available) {
      setOff("UNAVAILABLE");
      return;
    }
    const a = ensureAudio();
    if (!a) {
      setOff("UNAVAILABLE");
      return;
    }
    if (playing) {
      a.pause();
      setOff();
    } else {
      try {
        await a.play(); // user gesture → allowed
        setOn();
      } catch (_) {
        // autoplay blocked or file missing → stay off, no crash
        setOff(available ? "BLOCKED" : "UNAVAILABLE");
      }
    }
  }

  button.addEventListener("click", toggle);

  // restore label only (never auto-play — requires a fresh gesture)
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "on") setOff(); // show OFF; user must click to resume
  } catch (_) {}

  return { toggle };
}
