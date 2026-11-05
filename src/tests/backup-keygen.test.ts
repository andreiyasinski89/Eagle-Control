import { describe, expect, it } from "vitest";
import { bech32Encode, generateAgeKeyPair } from "../../scripts/backup/age-key";

// An independent check of a Bech32 string, written from the definition (BIP 173): the checksum of the prefix and the characters must come to 1.
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function checksumHolds(raw: string): boolean {
  const s = raw.toLowerCase(); // a Bech32 string is all capitals or all small letters; the checksum is of the small ones
  const i = s.lastIndexOf("1");
  const hrp = s.slice(0, i);
  const data = [...s.slice(i + 1)].map((c) => CHARSET.indexOf(c));
  if (data.some((v) => v < 0)) return false;
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data]) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let k = 0; k < 5; k++) if ((top >>> k) & 1) chk ^= gen[k]!;
  }
  return chk === 1;
}

describe("the keys of the backup", () => {
  it("Bech32 writes what its definition says: the published test string for an empty message, and a valid checksum on real keys", () => {
    expect(bech32Encode("a", new Uint8Array([]))).toBe("a12uel5l");
    const k = generateAgeKeyPair();
    expect(checksumHolds(k.recipient)).toBe(true);
    expect(checksumHolds(k.identity)).toBe(true);
    expect(checksumHolds(k.recipient.slice(0, -1) + (k.recipient.endsWith("q") ? "p" : "q"))).toBe(false); // one wrong letter is caught
  });

  it("makes a public key age1... and a private key AGE-SECRET-KEY-1..., of the lengths age writes, and each time a new pair", () => {
    const a = generateAgeKeyPair();
    const b = generateAgeKeyPair();
    expect(a.recipient).toMatch(/^age1[02-9ac-hj-np-z]{58}$/);
    expect(a.identity).toMatch(/^AGE-SECRET-KEY-1[02-9AC-HJ-NP-Z]{58}$/);
    expect(a.recipient).not.toBe(b.recipient);
    expect(a.identity).not.toBe(b.identity);
  });
});
