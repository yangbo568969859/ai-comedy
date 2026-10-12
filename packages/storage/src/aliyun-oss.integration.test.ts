import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AliyunOssStorage, parseAliyunOssConfig } from "./index.js";

const runIntegration = process.env.RUN_OSS_INTEGRATION === "1";

function integrationEnvironment(): Record<string, string | undefined> {
  return {
    OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER,
    OSS_REGION: process.env.OSS_REGION,
    OSS_BUCKET: process.env.OSS_BUCKET,
    OSS_ENDPOINT: process.env.OSS_ENDPOINT,
    OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID,
    OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET,
    OSS_SIGNED_URL_TTL_SECONDS: process.env.OSS_SIGNED_URL_TTL_SECONDS,
  };
}

describe.skipIf(!runIntegration)("AliyunOssStorage integration", () => {
  it("uploads, heads, privately reads by a signed URL, and deletes a temporary object", async () => {
    const storage = new AliyunOssStorage(parseAliyunOssConfig(integrationEnvironment()));
    const body = new TextEncoder().encode(`ai-manju OSS verification ${randomUUID()}`);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const key = `verification/oss/${randomUUID()}.txt`;
    let uploaded = false;

    try {
      const stored = await storage.put({
        key,
        content: body,
        contentType: "text/plain",
        expectedSha256: sha256,
      });
      uploaded = true;
      expect(stored).toMatchObject({ key, byteSize: body.byteLength, contentType: "text/plain", sha256 });

      await expect(storage.head(key)).resolves.toMatchObject({ key, byteSize: body.byteLength, sha256 });

      const signed = await storage.signGetUrl({ key, expiresInSeconds: 600 });
      expect(new URL(signed.url).hostname).toContain("aliyuncs.com");
      expect(signed.expiresAt).toBeTruthy();

      const response = await fetch(signed.url);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    } finally {
      if (uploaded) await storage.remove(key);
    }

    await expect(storage.head(key)).resolves.toBeNull();
  }, 30_000);
});
