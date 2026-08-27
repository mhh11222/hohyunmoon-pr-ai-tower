import { describe, it, expect } from "vitest";
import { noteToFreq, scaleNote, PENTATONIC, CHORDS, chordForBar, melodyPhrase, PHRASES } from "../ui/sound.js";

describe("음정", () => {
  it("A4 = 440Hz, 한 옥타브 위는 두 배", () => {
    expect(noteToFreq(69)).toBeCloseTo(440, 6);
    expect(noteToFreq(81)).toBeCloseTo(880, 6);
  });
});

describe("중국 5음계 (宮商角徵羽)", () => {
  it("다섯 음이고 반음(1도) 간격이 없다 — 어색한 음이 안 나온다", () => {
    expect(PENTATONIC).toHaveLength(5);
    for (let i = 1; i < PENTATONIC.length; i++) {
      expect(PENTATONIC[i] - PENTATONIC[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  it("계이름이 옥타브를 넘어가도 이어진다", () => {
    expect(scaleNote(0)).toBe(PENTATONIC[0]);
    expect(scaleNote(5)).toBe(PENTATONIC[0] + 12);
    expect(scaleNote(-1)).toBe(PENTATONIC[4] - 12);
    expect(scaleNote(0, 1)).toBe(PENTATONIC[0] + 12);
  });

  it("음이 계속 올라간다", () => {
    const notes = [0, 1, 2, 3, 4, 5, 6].map((d) => scaleNote(d));
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
  });
});

describe("진행", () => {
  it("D – Bm – G – A 네 마디를 돈다", () => {
    expect(CHORDS.map((c) => c.name)).toEqual(["D", "Bm", "G", "A"]);
    expect([0, 1, 2, 3, 4, 5].map((b) => chordForBar(b).name))
      .toEqual(["D", "Bm", "G", "A", "D", "Bm"]);
  });

  it("화음마다 세 음", () => {
    for (const chord of CHORDS) expect(chord.tones).toHaveLength(3);
  });
});

describe("선율", () => {
  it("프레이즈는 한 마디(4박)를 넘지 않는다", () => {
    for (const phrase of PHRASES) {
      for (const note of phrase) expect(note.t + note.len).toBeLessThanOrEqual(4);
    }
  });

  it("후반부는 한 음 위로 올라간다 — 같은 자리를 맴돌지 않게", () => {
    const first = melodyPhrase(0, () => 0);
    const later = melodyPhrase(4, () => 0);
    expect(later[0].d).toBe(first[0].d + 1);
  });

  it("난수를 줘도 항상 프레이즈 하나를 고른다", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(melodyPhrase(0, () => r).length).toBeGreaterThan(0);
    }
  });
});
