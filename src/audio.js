// AETHER ambient BGM — full Web Audio module.
//   graph: <audio src loop> → AudioContext → MediaElementSource → Gain → Analyser → destination
//   - AudioContext created/resumed ONLY on a user gesture (autoplay is blocked).
//   - default NOT playing. mute + last volume persisted to localStorage.
//   - missing-file guard: never throws, never breaks the page.
//   - exposes getEnergy() (0..1) for the visualizer + optional field pulse.
//
// Public API (createAudio):
//   { getEnergy, getBins, isPlaying, isMuted, destroy }

const SRC = "./assets/ambient.mp3";
const KEY_VOL = "moon-ai-tower:vol";
const KEY_MUTE = "moon-ai-tower:mute";
const KEY_STATE = "moon-ai-tower:sound"; // legacy key kept compatible
const FFT = 64; // → 32 frequency bins, plenty for a compact meter

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function loadVol() {
  try {
    const v = parseFloat(localStorage.getItem(KEY_VOL));
    return Number.isFinite(v) ? clamp01(v) : 0.45;
  } catch (_) {
    return 0.45;
  }
}
function loadMute() {
  try {
    return localStorage.getItem(KEY_MUTE) === "1";
  } catch (_) {
    return false;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (_) {}
}

export function createAudio(opts = {}) {
  const {
    playBtn,
    stopBtn,
    muteBtn,
    volSlider,
    statusEl, // small text readout (optional)
  } = opts;

  let audio = null;
  let ctx = null;
  let srcNode = null;
  let gain = null;
  let analyser = null;
  let bins = null; // Uint8Array of frequency data
  let available = true;
  let playing = false;
  let muted = loadMute();
  let volume = loadVol();

  // ---- UI sync ------------------------------------------------------------
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }
  function syncUI() {
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", String(playing));
      playBtn.setAttribute("aria-label", playing ? "Pause ambient music" : "Play ambient music");
      const g = playBtn.querySelector(".glyph");
      if (g) g.textContent = playing ? "⏸" : "▶";
    }
    if (muteBtn) {
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
      const g = muteBtn.querySelector(".glyph");
      if (g) g.textContent = muted ? "⌀" : "♪";
    }
    if (volSlider && volSlider.value !== String(Math.round(volume * 100))) {
      volSlider.value = String(Math.round(volume * 100));
    }
    if (!available) setStatus("UNAVAILABLE");
    else if (!playing) setStatus("READY");
    else if (muted) setStatus("MUTED");
    else setStatus("LIVE");
  }

  // ---- graph (lazy, on first gesture) -------------------------------------
  function ensureGraph() {
    if (ctx) return true;
    try {
      audio = new Audio(SRC);
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      audio.preload = "none";
      audio.addEventListener("error", () => {
        available = false;
        playing = false;
        syncUI();
      });

      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        // No Web Audio: fall back to bare <audio> element gain.
        available = !!audio;
        return available;
      }
      ctx = new AC();
      srcNode = ctx.createMediaElementSource(audio);
      gain = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT;
      analyser.smoothingTimeConstant = 0.82;
      bins = new Uint8Array(analyser.frequencyBinCount);

      srcNode.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      applyGain();
      return true;
    } catch (err) {
      // any failure → disable gracefully
      available = false;
      ctx = null;
      console.warn("[moon-ai-tower] audio graph unavailable:", err);
      return false;
    }
  }

  function applyGain() {
    const target = muted ? 0 : volume;
    if (gain && ctx) {
      // small ramp to avoid clicks
      try {
        gain.gain.setTargetAtTime(target, ctx.currentTime, 0.04);
      } catch (_) {
        gain.gain.value = target;
      }
    } else if (audio) {
      audio.volume = target;
    }
  }

  // ---- transport ----------------------------------------------------------
  // returns true if playback actually started (false = blocked / unavailable).
  async function play() {
    if (!available) return false;
    if (!ensureGraph() || !audio) {
      available = false;
      syncUI();
      return false;
    }
    try {
      if (ctx && ctx.state === "suspended") await ctx.resume();
      await audio.play(); // user gesture → allowed
      playing = true;
      save(KEY_STATE, "on");
      syncUI();
      return true;
    } catch (_) {
      // autoplay blocked or file missing → stay paused, no crash
      playing = false;
      syncUI();
      return false;
    }
  }

  function pause() {
    disarmGesture(); // explicit pause cancels any pending autoplay-on-gesture
    if (audio) audio.pause();
    playing = false;
    save(KEY_STATE, "off");
    syncUI();
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  function stop() {
    disarmGesture(); // explicit stop cancels any pending autoplay-on-gesture
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch (_) {}
    }
    playing = false;
    save(KEY_STATE, "off");
    syncUI();
  }

  function setMuted(next) {
    muted = !!next;
    save(KEY_MUTE, muted ? "1" : "0");
    if (muted) disarmGesture(); // muting cancels a pending gesture autostart
    applyGain();
    syncUI();
  }
  function toggleMute() {
    setMuted(!muted);
  }

  function setVolume(v) {
    volume = clamp01(v);
    save(KEY_VOL, String(volume));
    // adjusting volume off-zero implies an intent to hear → unmute
    if (volume > 0 && muted) {
      muted = false;
      save(KEY_MUTE, "0");
    }
    applyGain();
    syncUI();
  }

  // ---- browser-honest autoplay --------------------------------------------
  // Try to start on load; if the browser blocks autoplay-with-sound, arm a
  // ONE-TIME first-gesture listener that starts the track. Skips entirely when
  // skip() is true (mute flag set, or prefers-reduced-motion).
  let gestureArmed = false;
  let gestureHandler = null;
  const GESTURES = ["pointerdown", "keydown", "wheel", "touchstart"];

  function disarmGesture() {
    if (!gestureArmed) return;
    gestureArmed = false;
    GESTURES.forEach((ev) => removeEventListener(ev, gestureHandler));
    gestureHandler = null;
  }

  function armFirstGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    gestureHandler = () => {
      disarmGesture();
      // muted in the meantime, or no longer wanted → don't force it
      if (muted || playing || !available) return;
      play();
    };
    GESTURES.forEach((ev) =>
      addEventListener(ev, gestureHandler, { once: true, passive: true })
    );
  }

  async function autostart({ skip = false } = {}) {
    if (skip || muted || !available) {
      syncUI();
      return;
    }
    const started = await play(); // honest attempt — usually blocked on load
    if (!started) armFirstGesture(); // fall back to first user gesture
  }

  // ---- analyser readouts for the visualizer -------------------------------
  function getBins() {
    if (!analyser || !playing) return null;
    analyser.getByteFrequencyData(bins);
    return bins;
  }
  // overall energy 0..1 (RMS-ish over the low/mid bins where the drone lives)
  function getEnergy() {
    const b = getBins();
    if (!b) return 0;
    let sum = 0;
    const n = Math.min(b.length, 24);
    for (let i = 0; i < n; i++) sum += b[i] * b[i];
    const rms = Math.sqrt(sum / n) / 255;
    return muted ? 0 : clamp01(rms);
  }

  // ---- wire controls ------------------------------------------------------
  if (playBtn) playBtn.addEventListener("click", toggle);
  if (stopBtn) stopBtn.addEventListener("click", stop);
  if (muteBtn) muteBtn.addEventListener("click", toggleMute);
  if (volSlider) {
    volSlider.value = String(Math.round(volume * 100));
    volSlider.addEventListener("input", (e) => {
      setVolume(parseInt(e.target.value, 10) / 100);
    });
  }

  syncUI();

  return {
    play,
    pause,
    toggle,
    stop,
    autostart,
    setMuted,
    toggleMute,
    setVolume,
    getEnergy,
    getBins,
    isPlaying: () => playing,
    isMuted: () => muted,
  };
}
