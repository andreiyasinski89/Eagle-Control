import { describe, expect, it } from "vitest";
import { buildMessengerLink, lacksCountryCode, normalizeUsername, phoneWithCode } from "@/modules/crm/messenger";

const none = { phones: [], messengers: {} };

describe("phoneWithCode", () => {
  it("takes the digits of a number that carries its country code", () => {
    expect(phoneWithCode("+48 512 345 678")).toBe("48512345678");
    expect(phoneWithCode("0048512345678")).toBe("48512345678");
    expect(phoneWithCode("+375 29 123 45 67")).toBe("375291234567");
    expect(phoneWithCode("  +1 (415) 555-2671 ")).toBe("14155552671");
  });
  it("gives nothing for a number without a code: no country is guessed", () => {
    expect(phoneWithCode("512-345-678")).toBeNull();
    expect(phoneWithCode("512345678")).toBeNull();
    expect(phoneWithCode("048512345678")).toBeNull();
  });
  it("gives nothing for what is not a phone", () => {
    expect(phoneWithCode("")).toBeNull();
    expect(phoneWithCode(null)).toBeNull();
    expect(phoneWithCode("+12")).toBeNull();
    expect(phoneWithCode("+48 12345678901234567")).toBeNull();
  });
});

describe("lacksCountryCode", () => {
  it("is true for a number that needs its code, false for the rest", () => {
    expect(lacksCountryCode("512-345-678")).toBe(true);
    expect(lacksCountryCode("+48 512 345 678")).toBe(false);
    expect(lacksCountryCode("")).toBe(false);
    expect(lacksCountryCode("123")).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("reads a Telegram name written any way", () => {
    for (const v of ["@name_x", "name_x", "https://t.me/name_x", "t.me/name_x/", "https://telegram.me/name_x?start=1", " @name_x "]) expect(normalizeUsername("telegram", v), v).toBe("name_x");
  });
  it("reads an Instagram name written any way", () => {
    for (const v of ["@name.x", "name.x", "instagram.com/name.x/", "https://www.instagram.com/name.x?igsh=abc123", "https://instagram.com/_u/name.x", "https://ig.me/m/name.x"]) expect(normalizeUsername("instagram", v), v).toBe("name.x");
  });
  it("gives nothing for what is not a name", () => {
    expect(normalizeUsername("telegram", "ab")).toBeNull();
    expect(normalizeUsername("telegram", "has space")).toBeNull();
    expect(normalizeUsername("instagram", "")).toBeNull();
    expect(normalizeUsername("instagram", "https://instagram.com/")).toBeNull();
    expect(normalizeUsername("telegram", null)).toBeNull();
  });
});

describe("buildMessengerLink: Telegram", () => {
  it("opens the chat by the name, the text going by the clipboard", () => {
    expect(buildMessengerLink("telegram", { phones: [], messengers: { telegram: "@Anna_K" } }, "Привет")).toEqual({ url: "https://t.me/Anna_K", direct: true, textInLink: false });
  });
  it("falls back to the phone when there is no name", () => {
    expect(buildMessengerLink("telegram", { phones: ["+48 512 345 678"], messengers: {} }, "x").url).toBe("https://t.me/+48512345678");
  });
  it("skips a phone without a code and opens the share window with the text", () => {
    const l = buildMessengerLink("telegram", { phones: ["512-345-678"], messengers: {} }, "Привет, Анна & co");
    expect(l).toEqual({ url: `https://t.me/share/url?url=&text=${encodeURIComponent("Привет, Анна & co")}`, direct: false, textInLink: true });
  });
});

describe("buildMessengerLink: WhatsApp", () => {
  it("opens the chat with the text for a number with a code", () => {
    expect(buildMessengerLink("whatsapp", { phones: ["+48 512 345 678"], messengers: {} }, "Привет мир")).toEqual({ url: `https://wa.me/48512345678?text=${encodeURIComponent("Привет мир")}`, direct: true, textInLink: true });
  });
  it("prefers the number given for WhatsApp, also as a wa.me link", () => {
    const c = { phones: ["+48 111 111 111"], messengers: { whatsapp: "0048 600 700 800" } };
    expect(buildMessengerLink("whatsapp", c, "x").url).toBe("https://wa.me/48600700800?text=x");
    expect(buildMessengerLink("whatsapp", { phones: [], messengers: { whatsapp: "https://wa.me/375291234567" } }, "x").url).toBe("https://wa.me/375291234567?text=x");
  });
  it("lets the person choose the receiver when there is no usable number", () => {
    expect(buildMessengerLink("whatsapp", { phones: ["512-345-678"], messengers: {} }, "Привет")).toEqual({ url: `https://wa.me/?text=${encodeURIComponent("Привет")}`, direct: false, textInLink: true });
    expect(buildMessengerLink("whatsapp", none, "a b").url).toBe("https://wa.me/?text=a%20b");
  });
});

describe("buildMessengerLink: Instagram", () => {
  it("opens the conversation by the name", () => {
    expect(buildMessengerLink("instagram", { phones: [], messengers: { instagram: "https://www.instagram.com/anna.k?igsh=1" } }, "x")).toEqual({ url: "https://ig.me/m/anna.k", direct: true, textInLink: false });
  });
  it("opens the list of conversations without a name", () => {
    expect(buildMessengerLink("instagram", none, "x")).toEqual({ url: "https://www.instagram.com/direct/inbox/", direct: false, textInLink: false });
  });
});
