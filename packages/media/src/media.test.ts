import { describe, expect, it } from "vitest";

import { assetMetadataSchema, verifyContentSha256, WebCryptoSha256Hasher, type Sha256Hasher } from "./index.js";

const assetId = "c0a0fcf3-3a8c-4fe5-a9a0-cfe8fceb36d0";
const digest = "a".repeat(64);

describe("asset metadata", () => {
  it("accepts private storage metadata but rejects URL locations", () => {
    const base = {
      contractVersion: "v1",
      assetId,
      kind: "image",
      mimeType: "image/png",
      byteSize: 42,
      sha256: digest,
      privateObjectKey: "assets/2026/10/asset.png",
      createdAt: "2026-10-04T12:00:00.000Z",
    };

    expect(assetMetadataSchema.safeParse(base).success).toBe(true);
    expect(assetMetadataSchema.safeParse({ ...base, privateObjectKey: "https://example.test/file.png" }).success).toBe(false);
  });
});

describe("content hash verification", () => {
  const hasher: Sha256Hasher = { async digest() { return digest; } };

  it("compares normalized SHA-256 digests without retaining content", async () => {
    await expect(verifyContentSha256(digest.toUpperCase(), new Uint8Array([1, 2]), hasher)).resolves.toEqual({
      matches: true,
      actualSha256: digest,
    });
    await expect(verifyContentSha256("b".repeat(64), new Uint8Array([1, 2]), hasher)).resolves.toEqual({
      matches: false,
      expectedSha256: "b".repeat(64),
      actualSha256: digest,
    });
  });

  it("uses the platform SHA-256 implementation when one is available", async () => {
    const result = await new WebCryptoSha256Hasher().digest(new TextEncoder().encode("abc"));
    expect(result).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
