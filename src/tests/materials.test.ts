import { describe, expect, it } from "vitest";
import { cleanQr, guessKind, isLink, materialLine, qrBox } from "@/modules/crm/materials";

describe("cleanQr", () => {
  it("keeps a known corner and holds the size between 10 and 40", () => {
    expect(cleanQr({ corner: "top-left", size: 25.4 })).toEqual({ corner: "top-left", size: 25 });
    expect(cleanQr({ corner: "center", size: 99 })).toEqual({ corner: "center", size: 40 });
    expect(cleanQr({ corner: "center", size: 1 })).toEqual({ corner: "center", size: 10 });
    expect(cleanQr({ corner: "bottom-right" })).toEqual({ corner: "bottom-right", size: 24 });
  });
  it("is nothing for anything else", () => {
    expect(cleanQr(null)).toBeNull();
    expect(cleanQr({ corner: "middle" })).toBeNull();
    expect(cleanQr("x")).toBeNull();
  });
});

describe("qrBox", () => {
  const w = 1000;
  const h = 1800;
  it("puts the square into the chosen corner with a margin of 4% of the width", () => {
    expect(qrBox({ corner: "bottom-right", size: 20 }, w, h)).toEqual({ x: 760, y: 1560, side: 200 });
    expect(qrBox({ corner: "top-left", size: 20 }, w, h)).toEqual({ x: 40, y: 40, side: 200 });
    expect(qrBox({ corner: "top-right", size: 20 }, w, h)).toEqual({ x: 760, y: 40, side: 200 });
    expect(qrBox({ corner: "bottom-left", size: 20 }, w, h)).toEqual({ x: 40, y: 1560, side: 200 });
  });
  it("centres it", () => {
    expect(qrBox({ corner: "center", size: 20 }, w, h)).toEqual({ x: 400, y: 800, side: 200 });
  });
});

describe("links and kinds", () => {
  it("accepts only http and https links", () => {
    expect(isLink("https://youtu.be/abc")).toBe(true);
    expect(isLink(" http://x.io/a?b=1 ")).toBe(true);
    expect(isLink("javascript:alert(1)")).toBe(false);
    expect(isLink("ftp://x.io")).toBe(false);
    expect(isLink("not a link")).toBe(false);
  });
  it("guesses the kind", () => {
    expect(guessKind("https://youtu.be/abc")).toBe("VIDEO");
    expect(guessKind("image/png")).toBe("IMAGE");
    expect(guessKind("application/pdf")).toBe("PDF");
    expect(guessKind("https://docs.google.com/presentation/d/1")).toBe("PRESENTATION");
    expect(guessKind("https://example.com/page")).toBe("OTHER");
  });
  it("writes the line for a message", () => {
    expect(materialLine("Презентация", "https://x.io/m/abc")).toBe("Презентация: https://x.io/m/abc");
  });
});
