import { describe, it, expect } from "vitest";
import { detectLang, applyLang } from "../src/i18n.js";

const store = (init = {}) => {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
  };
};

describe("detectLang", () => {
  it("prefers a stored choice over the browser language", () => {
    expect(detectLang({ language: "en-US" }, store({ "moon-ai-tower:lang": "ko" }))).toBe("ko");
  });
  it("falls back to navigator language (Korean → ko)", () => {
    expect(detectLang({ language: "ko-KR" }, store())).toBe("ko");
  });
  it("defaults to en for non-Korean browsers", () => {
    expect(detectLang({ language: "fr-FR" }, store())).toBe("en");
  });
  it("survives a missing navigator", () => {
    expect(detectLang(undefined, store())).toBe("en");
  });
  it("ignores a junk stored value", () => {
    expect(detectLang({ language: "ko-KR" }, store({ "moon-ai-tower:lang": "zz" }))).toBe("ko");
  });
});

describe("applyLang", () => {
  it("sets html lang, body data-lang, and persists the choice", () => {
    const doc = { documentElement: { lang: "" }, body: { dataset: {} } };
    const s = store();
    applyLang("ko", { doc, store: s });
    expect(doc.documentElement.lang).toBe("ko");
    expect(doc.body.dataset.lang).toBe("ko");
    expect(s.getItem("moon-ai-tower:lang")).toBe("ko");
  });
  it("normalizes anything non-ko to en", () => {
    const doc = { documentElement: { lang: "" }, body: { dataset: {} } };
    applyLang("zz", { doc, store: store() });
    expect(doc.body.dataset.lang).toBe("en");
  });
  it("does not throw when storage is unavailable (private mode)", () => {
    const doc = { documentElement: { lang: "" }, body: { dataset: {} } };
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => applyLang("en", { doc, store: throwing })).not.toThrow();
  });
});
