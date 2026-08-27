// 소리 — 파일 없이 WebAudio로 직접 만든다. (저작권 있는 곡을 쓰지 않는다)
//
//   효과음: 마작패 부딪히는 딱! 소리, 섞기, 주사위, 산가지, 완성
//   배경음: 90년대 홍콩 영화풍 잔잔한 곡을 즉석에서 합성한다.
//           중국 5음계(宮商角徵羽) + 고쟁(古箏)풍 뜯는 소리 + 얼후풍 선율 +
//           D–Bm–G–A 진행. 매번 조금씩 달라지는 원곡이다.

/* ── 음악 이론(순수 계산) ─────────────────────────────── */

/** 반음 번호 → 주파수. A4(69) = 440Hz */
export function noteToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** D 장조 5음계: 宮商角徵羽 (D E F# A B) */
export const PENTATONIC = [62, 64, 66, 69, 71];

/** 5음계 계이름(0부터) → 반음 번호. 옥타브를 넘어가도 이어진다. */
export function scaleNote(degree, octave = 0) {
  const size = PENTATONIC.length;
  const wrap = ((degree % size) + size) % size;
  const shift = Math.floor(degree / size) + octave;
  return PENTATONIC[wrap] + 12 * shift;
}

/** 90년대 홍콩 발라드가 즐겨 쓰던 진행: D – Bm – G – A */
export const CHORDS = [
  { name: "D", root: 50, tones: [0, 2, 4] },   // 宮
  { name: "Bm", root: 47, tones: [4, 1, 3] },  // 羽
  { name: "G", root: 43, tones: [3, 0, 2] },   // 徵
  { name: "A", root: 45, tones: [1, 3, 0] },   // 商
];

/** 마디마다 도는 화음 */
export function chordForBar(bar) {
  return CHORDS[bar % CHORDS.length];
}

/**
 * 선율 한 마디 — 5음계 안에서만 움직여 어색한 음이 안 나온다.
 * rng를 주면 매번 조금씩 다른 프레이즈가 나온다.
 */
export const PHRASES = [
  [{ d: 2, t: 0, len: 1.5 }, { d: 1, t: 1.5, len: 0.5 }, { d: 0, t: 2, len: 2 }],
  [{ d: 4, t: 0, len: 1 }, { d: 3, t: 1, len: 1 }, { d: 2, t: 2, len: 2 }],
  [{ d: 0, t: 0, len: 2 }, { d: 2, t: 2, len: 1 }, { d: 3, t: 3, len: 1 }],
  [{ d: 3, t: 0.5, len: 1.5 }, { d: 2, t: 2, len: 0.5 }, { d: 4, t: 2.5, len: 1.5 }],
  [{ d: 5, t: 0, len: 1 }, { d: 4, t: 1, len: 1.5 }, { d: 2, t: 2.5, len: 1.5 }],
];

export function melodyPhrase(bar, rand = Math.random) {
  const phrase = PHRASES[Math.floor(rand() * PHRASES.length)];
  const lift = bar % 8 >= 4 ? 1 : 0; // 후반부는 한 음 위로 — 같은 자리를 맴돌지 않게
  return phrase.map((n) => ({ ...n, d: n.d + lift }));
}

/* ── 소리 만들기 ────────────────────────────────────── */

const BPM = 68;              // 잔잔하게
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let reverb = null;
  let musicOn = false;
  let sfxOn = true;
  let scheduler = null;
  let nextBarTime = 0;
  let bar = 0;

  function ensure() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.4, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet);
    wet.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    musicBus.connect(reverb);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    sfxBus.connect(reverb);
    return ctx;
  }

  /** 잔향용 임펄스 — 노이즈가 지수적으로 사그라든다 */
  function impulse(context, seconds, decay) {
    const rate = context.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = context.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      }
    }
    return buffer;
  }

  function noiseBuffer(seconds = 0.4) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** 패가 부딪히는 소리 — 딱! 하는 순간음 + 나무 울림 */
  function clack(when = 0, { gain = 1, pitch = 1 } = {}) {
    if (!ensure() || !sfxOn) return;
    const t = ctx.currentTime + when;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(0.08);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2400 * pitch * (0.9 + Math.random() * 0.2);
    band.Q.value = 1.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.5 * gain, t);
    nGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    noise.connect(band).connect(nGain).connect(sfxBus);
    noise.start(t);
    noise.stop(t + 0.1);

    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(230 * pitch * (0.92 + Math.random() * 0.16), t);
    body.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.07);
    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(0.32 * gain, t);
    bGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    body.connect(bGain).connect(sfxBus);
    body.start(t);
    body.stop(t + 0.12);
  }

  /**
   * 고양이 울음 — "야~옹". 올라갔다 내려오는 기본음 + 포먼트 필터.
   * pitch가 높으면 작은 고양이(포도), 낮으면 크고 뚱뚱한 고양이(막내).
   */
  function meow(pitch = 1, len = 0.65) {
    if (!ensure() || !sfxOn) return;
    const t = ctx.currentTime;
    const f0 = 560 * pitch;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f0 * 0.6, t);
    osc.frequency.linearRampToValueAtTime(f0 * 1.15, t + len * 0.32);   // "야~"
    osc.frequency.setValueAtTime(f0 * 1.15, t + len * 0.45);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + len);      // "~옹"

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 6.5;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = f0 * 0.03;
    vibrato.connect(vibratoGain).connect(osc.frequency);

    // 입 모양 — 포먼트가 열렸다 닫힌다
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 1.6;
    formant.frequency.setValueAtTime(900 * pitch, t);
    formant.frequency.linearRampToValueAtTime(1500 * pitch, t + len * 0.35);
    formant.frequency.exponentialRampToValueAtTime(600 * pitch, t + len);

    const g = ctx.createGain();
    const vol = 0.34 / Math.sqrt(pitch); // 큰 고양이가 더 우렁차다
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);

    osc.connect(formant).connect(g).connect(sfxBus);
    osc.start(t); vibrato.start(t);
    osc.stop(t + len + 0.05); vibrato.stop(t + len + 0.05);
  }

  /** 산가지 — 가는 대나무가 부딪히는 소리 */
  function stick(when = 0) {
    clack(when, { gain: 0.5, pitch: 2.1 });
  }

  /** 주사위 — 짧은 소리 여러 번 굴러가다 멈춘다 */
  function dice() {
    if (!ensure() || !sfxOn) return;
    let t = 0;
    for (let i = 0; i < 7; i++) {
      clack(t, { gain: 0.32 + i * 0.05, pitch: 1.7 - i * 0.06 });
      t += 0.07 + i * 0.02;
    }
  }

  /** 섞기 — 패가 휘휘 도는 소리 */
  function shuffle(seconds = 1.4) {
    if (!ensure() || !sfxOn) return;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(seconds);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.25);
    g.gain.setValueAtTime(0.22, t + seconds - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 700;
    lfo.connect(lfoGain).connect(band.frequency);
    lfo.start(t);
    lfo.stop(t + seconds);
    noise.connect(band).connect(g).connect(sfxBus);
    noise.start(t);
    noise.stop(t + seconds);
    for (let i = 0; i < 14; i++) clack(Math.random() * seconds, { gain: 0.18, pitch: 1 + Math.random() });
  }

  /** 고쟁(古箏)풍 뜯는 소리 */
  function pluck(midi, when, dur = 1.1, gain = 0.16, bus = musicBus) {
    const t = (nextBarTime || ctx.currentTime) + when;
    const freq = noteToFreq(midi);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = freq * 1.004;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 6, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.6, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(bus);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }

  /** 얼후(二胡)풍 선율 — 느린 시작과 비브라토 */
  function bow(midi, when, dur = 1.2, gain = 0.1) {
    const t = (nextBarTime || ctx.currentTime) + when;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = noteToFreq(midi);
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = noteToFreq(midi + 12);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.18;

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(0, t);
    vibratoGain.gain.linearRampToValueAtTime(noteToFreq(midi) * 0.012, t + dur * 0.5);
    vibrato.connect(vibratoGain).connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.18);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    shimmer.connect(shimmerGain).connect(g);
    g.connect(musicBus);
    osc.start(t); shimmer.start(t); vibrato.start(t);
    osc.stop(t + dur + 0.05); shimmer.stop(t + dur + 0.05); vibrato.stop(t + dur + 0.05);
  }

  /** 낮게 깔리는 패드 */
  function pad(chord, when, dur) {
    const t = (nextBarTime || ctx.currentTime) + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(g).connect(musicBus);
    for (const [i, tone] of chord.tones.entries()) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = noteToFreq(scaleNote(tone, 0)) * (i === 0 ? 1 : 1.002);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  function bass(midi, when, dur) {
    const t = (nextBarTime || ctx.currentTime) + when;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = noteToFreq(midi - 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** 한 마디 예약 */
  function scheduleBar() {
    const chord = chordForBar(bar);
    pad(chord, 0, BAR * 0.98);
    bass(chord.root, 0, BEAT * 1.6);
    bass(chord.root, BEAT * 2, BEAT * 1.4);

    // 고쟁 아르페지오
    const pattern = [0, 2, 1, 2, 0, 1];
    for (const [i, step] of pattern.entries()) {
      pluck(scaleNote(chord.tones[step % chord.tones.length], i > 3 ? 1 : 0), i * BEAT * 0.66, 1.0, 0.11);
    }
    // 얼후 선율 — 두 마디에 한 번씩 쉬어 간다
    if (bar % 2 === 0) {
      for (const note of melodyPhrase(bar)) {
        bow(scaleNote(note.d, 1), note.t * BEAT, note.len * BEAT * 0.95, 0.085);
      }
    }
    bar += 1;
    nextBarTime += BAR;
  }

  function startMusic() {
    if (!ensure()) return false;
    ctx.resume?.();
    if (musicOn) return true;
    musicOn = true;
    bar = 0;
    nextBarTime = ctx.currentTime + 0.12;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2.5);
    scheduleBar();
    scheduler = setInterval(() => {
      if (!musicOn) return;
      while (nextBarTime < ctx.currentTime + 1.5) scheduleBar();
    }, 250);
    return true;
  }

  function stopMusic() {
    if (!ctx || !musicOn) return;
    musicOn = false;
    clearInterval(scheduler);
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  }

  /** 완성 — 5음계로 올라가는 짧은 마무리 */
  function fanfare() {
    if (!ensure() || !sfxOn) return;
    const base = ctx.currentTime;
    const saved = nextBarTime;
    nextBarTime = base;
    for (const [i, d] of [0, 2, 4, 5, 7].entries()) {
      pluck(scaleNote(d, 1), i * 0.13, 1.4, 0.2, sfxBus);
    }
    // 낮은 징
    const gong = ctx.createOscillator();
    gong.type = "sine";
    gong.frequency.value = noteToFreq(38);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, base);
    g.gain.exponentialRampToValueAtTime(0.25, base + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, base + 2.2);
    gong.connect(g).connect(sfxBus);
    gong.start(base);
    gong.stop(base + 2.3);
    nextBarTime = saved;
  }

  return {
    get ready() { return !!ctx; },
    get musicPlaying() { return musicOn; },
    get sfxEnabled() { return sfxOn; },
    unlock() { ensure(); ctx?.resume?.(); },
    setSfx(on) { sfxOn = on; },
    toggleMusic() { return musicOn ? (stopMusic(), false) : startMusic(); },
    startMusic,
    stopMusic,
    sfx: { clack, stick, dice, shuffle, fanfare, meow },
  };
}
