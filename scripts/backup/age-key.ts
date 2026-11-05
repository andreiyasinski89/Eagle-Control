import { generateKeyPairSync } from "node:crypto";

/**
 * Keys for `age`, the small file-encryption tool the nightly backup uses (https://age-encryption.org). A key pair is made here, on the owner's own
 * machine, so that the private key never passes through GitHub: only the public one (`age1...`) is given to the backup, which can encrypt with it
 * but cannot read anything back. The format is the one `age` defines: an X25519 key written in Bech32, with the prefix "age" for the public key and
 * "age-secret-key-" (in capitals) for the private one. The backup's self-test encrypts and decrypts with the real `age`, so a mistake here shows at once.
 */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: readonly number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i] as number;
  }
  return chk >>> 0;
}

const hrpExpand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

/** 8-bit bytes regrouped as 5-bit numbers, as Bech32 writes them. */
function toFiveBits(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** Bech32 (the original, with checksum constant 1) as `age` uses it. */
export function bech32Encode(hrp: string, data: Uint8Array): string {
  const five = toFiveBits(data);
  const mod = polymod([...hrpExpand(hrp), ...five, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...five, ...checksum].map((v) => CHARSET[v]).join("")}`;
}

const fromB64Url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export interface AgeKeyPair {
  /** `age1...`: safe to publish; it can only encrypt. */
  recipient: string;
  /** `AGE-SECRET-KEY-1...`: keeps every backup readable; it must never leave the owner. */
  identity: string;
}

export function generateAgeKeyPair(): AgeKeyPair {
  const { privateKey } = generateKeyPairSync("x25519");
  const jwk = privateKey.export({ format: "jwk" });
  if (!jwk.d || !jwk.x) throw new Error("Could not make a key");
  return { recipient: bech32Encode("age", fromB64Url(jwk.x)), identity: bech32Encode("age-secret-key-", fromB64Url(jwk.d)).toUpperCase() };
}
