import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWith, encryptWith } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("secret encryption", () => {
  it("round-trips and never repeats a ciphertext", () => {
    const a = encryptWith(key, "xoxb-secret-token");
    const b = encryptWith(key, "xoxb-secret-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("xoxb");
    expect(decryptWith(key, a)).toBe("xoxb-secret-token");
    expect(decryptWith(key, b)).toBe("xoxb-secret-token");
  });
  it("handles unicode and empty strings", () => {
    expect(decryptWith(key, encryptWith(key, "Привет, мир ✓"))).toBe("Привет, мир ✓");
    expect(decryptWith(key, encryptWith(key, ""))).toBe("");
  });
  it("detects tampering and the wrong key", () => {
    const blob = encryptWith(key, "secret");
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decryptWith(key, parts.join("."))).toThrow();
    expect(() => decryptWith(randomBytes(32).toString("base64"), blob)).toThrow();
    expect(() => decryptWith(key, "garbage")).toThrow(/format/);
  });
  it("refuses to run without a proper key", () => {
    expect(() => encryptWith(undefined, "x")).toThrow(/SECRETS_KEY/);
    expect(() => encryptWith(Buffer.from("short").toString("base64"), "x")).toThrow(/32 bytes/);
  });
});
