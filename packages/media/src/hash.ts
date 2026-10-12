import { sha256HexSchema } from "@ai-manju/domain";

/** A boundary interface: callers stream or fetch bytes, but this package never persists them. */
export interface Sha256Hasher {
  digest(input: Uint8Array): Promise<string>;
}

export class WebCryptoSha256Hasher implements Sha256Hasher {
  async digest(input: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto SubtleCrypto is unavailable; provide a Sha256Hasher implementation");
    }

    // Copying also normalizes a SharedArrayBuffer-backed view to an ArrayBuffer-backed view,
    // which is the portable Web Crypto input type.
    const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(input));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

export type ContentHashVerification =
  | { matches: true; actualSha256: string }
  | { matches: false; expectedSha256: string; actualSha256: string };

export async function verifyContentSha256(
  expectedSha256: string,
  content: Uint8Array,
  hasher: Sha256Hasher = new WebCryptoSha256Hasher(),
): Promise<ContentHashVerification> {
  const expected = sha256HexSchema.parse(expectedSha256).toLowerCase();
  const actual = sha256HexSchema.parse(await hasher.digest(content)).toLowerCase();

  return actual === expected
    ? { matches: true, actualSha256: actual }
    : { matches: false, expectedSha256: expected, actualSha256: actual };
}
