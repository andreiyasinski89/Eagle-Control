import { describe, expect, it } from "vitest";
import { displayName, initialsOf, normalizePhone, normalizeTelegram, telegramUrl } from "@/modules/account/profile";

describe("Telegram names", () => {
  it("reads a user name written as @name, name, or a link", () => {
    for (const v of ["@andrei_y", "andrei_y", " t.me/andrei_y ", "https://t.me/andrei_y", "http://telegram.me/andrei_y", "https://t.me/andrei_y?start=x", "www.t.me/andrei_y/"]) expect(normalizeTelegram(v), v).toBe("andrei_y");
  });
  it("refuses what is not a user name", () => {
    for (const v of ["@a", "1abc_def", "has space", "@@name", "https://example.com/name", "ab", "x".repeat(40)]) expect(normalizeTelegram(v), v).toBeNull();
    expect(normalizeTelegram("   ")).toBeNull();
  });
  it("makes a link", () => expect(telegramUrl("andrei_y")).toBe("https://t.me/andrei_y"));
});

describe("phone numbers", () => {
  it("accepts a number with a country code and the usual separators, and tidies the spaces", () => {
    expect(normalizePhone("+48  600 100 200")).toBe("+48 600 100 200");
    expect(normalizePhone("(044) 123-45-67")).toBe("(044) 123-45-67");
    expect(normalizePhone("600100200")).toBe("600100200");
  });
  it("refuses letters, too few or too many digits", () => {
    for (const v of ["abc", "12345", "+1234567890123456", "600 100 20x", "", "  "]) expect(normalizePhone(v), v).toBeNull();
  });
});

describe("names", () => {
  it("joins first and last name, skipping what is missing", () => {
    expect(displayName(" Andrei ", "Yasinski")).toBe("Andrei Yasinski");
    expect(displayName("Andrei", "")).toBe("Andrei");
    expect(displayName(null, "Yasinski")).toBe("Yasinski");
    expect(displayName("", null)).toBeNull();
  });
  it("makes initials from first and last name, or from the e-mail", () => {
    expect(initialsOf("Andrei Yasinski", "a@x.io")).toBe("AY");
    expect(initialsOf("Anna Maria Nowak", "a@x.io")).toBe("AN");
    expect(initialsOf("Andrei", "a@x.io")).toBe("AN");
    expect(initialsOf(null, "zed@x.io")).toBe("ZE");
  });
});
