import { describe, expect, it } from "vitest";
import { extractUrls, hostOf, previewOf, safeUrl } from "@/modules/notes/links";

describe("web addresses in notes", () => {
  it("makes only http and https addresses clickable", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("example.com/path")).toBe("https://example.com/path");
    expect(safeUrl(" http://example.com ")).toBe("http://example.com/");
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://example.com", "", "   ", null, undefined, "not a url at all"]) expect(safeUrl(bad as string), String(bad)).toBeNull();
    expect(safeUrl(`https://example.com/${"a".repeat(2000)}`)).toBeNull();
  });
  it("finds the addresses in a text, each once, without the punctuation of the sentence", () => {
    const t = "Watch https://youtu.be/abc, then (https://example.com/x). Again https://youtu.be/abc! And http://a.io/p?q=1;";
    expect(extractUrls(t)).toEqual(["https://youtu.be/abc", "https://example.com/x", "http://a.io/p?q=1"]);
    expect(extractUrls("no links here")).toEqual([]);
    expect(extractUrls("javascript:alert(1) https://ok.io")).toEqual(["https://ok.io"]);
  });
  it("caps how many it takes from one note", () => {
    const many = Array.from({ length: 80 }, (_, i) => `https://e${i}.io`).join(" ");
    expect(extractUrls(many)).toHaveLength(50);
  });
  it("names the site and shortens a text for a list", () => {
    expect(hostOf("https://www.example.com/a")).toBe("example.com");
    expect(hostOf("nonsense")).toBe("nonsense");
    expect(previewOf("a\n\n  b   c")).toBe("a b c");
    expect(previewOf("x".repeat(300))).toHaveLength(160);
  });
});
