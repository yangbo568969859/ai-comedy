import { describe, expect, it, vi } from "vitest";

import { AliyunOssStorage, parseAliyunOssConfig, type AliyunOssSdkClient } from "./index.js";

const digest = "a".repeat(64);
const config = parseAliyunOssConfig({
  OBJECT_STORAGE_PROVIDER: "aliyun-oss",
  OSS_REGION: "cn-shanghai",
  OSS_BUCKET: "ai-manju-dev-1",
  OSS_ENDPOINT: "https://oss-cn-shanghai.aliyuncs.com",
  OSS_ACCESS_KEY_ID: "LTAI0123456789abcdef",
  OSS_ACCESS_KEY_SECRET: "secret-for-unit-tests-only",
  OSS_SIGNED_URL_TTL_SECONDS: "600",
});

function createClient(): AliyunOssSdkClient {
  return {
    put: vi.fn().mockResolvedValue({
      res: { headers: { "content-length": "3", "content-type": "video/mp4", "x-oss-meta-sha256": digest, etag: "etag-1" } },
    }),
    head: vi.fn(),
    signatureUrl: vi.fn().mockReturnValue("https://oss-cn-shanghai.aliyuncs.com/private/video.mp4?signature=redacted"),
    delete: vi.fn().mockResolvedValue({}),
  };
}

describe("AliyunOssStorage", () => {
  it("parses explicit configuration without reading process.env", () => {
    expect(config.signedUrlTtlSeconds).toBe(600);
    expect(() => parseAliyunOssConfig({ OBJECT_STORAGE_PROVIDER: "aliyun-oss" })).toThrow();
  });

  it("verifies the SHA-256 and writes only private object metadata", async () => {
    const client = createClient();
    const hasher = { digest: vi.fn().mockResolvedValue(digest) };
    const storage = new AliyunOssStorage(config, client, hasher);

    await expect(storage.put({
      key: "private/runs/one/video.mp4",
      content: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
      expectedSha256: digest,
    })).resolves.toMatchObject({ key: "private/runs/one/video.mp4", byteSize: 3, sha256: digest });
    expect(client.put).toHaveBeenCalledWith("private/runs/one/video.mp4", expect.any(Uint8Array), {
      headers: { "Content-Type": "video/mp4", "x-oss-meta-sha256": digest },
    });
  });

  it("rejects a content hash mismatch before contacting OSS", async () => {
    const client = createClient();
    const storage = new AliyunOssStorage(config, client, { digest: vi.fn().mockResolvedValue("b".repeat(64)) });
    await expect(storage.put({
      key: "private/runs/one/video.mp4",
      content: new Uint8Array([1]),
      contentType: "video/mp4",
      expectedSha256: digest,
    })).rejects.toThrow("SHA-256");
    expect(client.put).not.toHaveBeenCalled();
  });

  it("returns null for a missing object and creates a capped GET signature", async () => {
    const client = createClient();
    client.head = vi.fn().mockRejectedValue({ status: 404 });
    const storage = new AliyunOssStorage(config, client, undefined, () => new Date("2026-10-05T00:00:00.000Z"));
    await expect(storage.head("private/missing.mp4")).resolves.toBeNull();
    await expect(storage.signGetUrl({ key: "private/missing.mp4", expiresInSeconds: 3_600 })).resolves.toEqual({
      key: "private/missing.mp4",
      url: "https://oss-cn-shanghai.aliyuncs.com/private/video.mp4?signature=redacted",
      expiresAt: "2026-10-05T00:10:00.000Z",
    });
  });

  it("rejects URLs as object keys and can delete an opaque key", async () => {
    const client = createClient();
    const storage = new AliyunOssStorage(config, client);
    await expect(storage.remove("https://example.invalid/private.mp4")).rejects.toThrow("Invalid private object key");
    await storage.remove("private/runs/one/video.mp4");
    expect(client.delete).toHaveBeenCalledWith("private/runs/one/video.mp4");
  });
});
