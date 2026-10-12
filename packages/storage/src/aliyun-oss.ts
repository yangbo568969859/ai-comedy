import { Buffer } from "node:buffer";

import OSS from "ali-oss";
import { z } from "zod";

import { WebCryptoSha256Hasher, verifyContentSha256, type Sha256Hasher } from "@ai-manju/media";

import {
  signGetRequestSchema,
  storageObjectKeySchema,
  storagePutRequestSchema,
  storedObjectSchema,
  type SignGetRequest,
  type SignedGetUrl,
  type StoragePort,
  type StoragePutRequest,
  type StoredObject,
} from "./storage.js";

const sha256MetadataHeader = "x-oss-meta-sha256";
const contentTypeHeader = "content-type";
const contentLengthHeader = "content-length";
const eTagHeader = "etag";

export const aliyunOssConfigSchema = z.object({
  provider: z.literal("aliyun-oss"),
  region: z.string().regex(/^cn-[a-z0-9-]+$/, "Expected an Alibaba Cloud region such as cn-shanghai"),
  bucket: z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  endpoint: z.string().url().refine((value) => value.startsWith("https://"), "OSS endpoint must use HTTPS"),
  accessKeyId: z.string().min(16).max(128),
  accessKeySecret: z.string().min(16).max(256),
  signedUrlTtlSeconds: z.number().int().min(1).max(3_600).default(600),
});
export type AliyunOssConfig = z.infer<typeof aliyunOssConfigSchema>;

/** Parse an explicit environment-like object; this package never reads process.env itself. */
export function parseAliyunOssConfig(environment: Record<string, string | undefined>): AliyunOssConfig {
  return aliyunOssConfigSchema.parse({
    provider: environment.OBJECT_STORAGE_PROVIDER,
    region: environment.OSS_REGION,
    bucket: environment.OSS_BUCKET,
    endpoint: environment.OSS_ENDPOINT,
    accessKeyId: environment.OSS_ACCESS_KEY_ID,
    accessKeySecret: environment.OSS_ACCESS_KEY_SECRET,
    signedUrlTtlSeconds: environment.OSS_SIGNED_URL_TTL_SECONDS === undefined
      ? undefined
      : Number(environment.OSS_SIGNED_URL_TTL_SECONDS),
  });
}

type OssHeaders = Record<string, string | number | undefined>;

export interface AliyunOssSdkClient {
  put(name: string, content: Uint8Array, options: { headers: Record<string, string> }): Promise<{ res?: { headers?: OssHeaders }; etag?: string }>;
  head(name: string): Promise<{ res?: { headers?: OssHeaders } }>;
  signatureUrl(name: string, options: { method: "GET"; expires: number }): string;
  delete(name: string): Promise<unknown>;
}

function createSdkClient(config: AliyunOssConfig): AliyunOssSdkClient {
  return new OSS({
    region: `oss-${config.region}`,
    bucket: config.bucket,
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
  }) as unknown as AliyunOssSdkClient;
}

function getHeader(headers: OssHeaders | undefined, name: string): string | undefined {
  if (headers === undefined) return undefined;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = found?.[1];
  return value === undefined ? undefined : String(value);
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; code?: unknown; statusCode?: unknown };
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.code === "NoSuchKey";
}

function toStoredObject(
  key: string,
  headers: OssHeaders | undefined,
  fallback?: { sha256: string; byteSize: number; contentType: string },
  preferFallback = false,
): StoredObject {
  // PUT responses describe the empty response body, not the stored object.
  const byteSize = preferFallback
    ? (fallback === undefined ? undefined : String(fallback.byteSize))
    : getHeader(headers, contentLengthHeader) ?? (fallback === undefined ? undefined : String(fallback.byteSize));
  const contentType = preferFallback ? fallback?.contentType : getHeader(headers, contentTypeHeader) ?? fallback?.contentType;
  const sha256 = preferFallback ? fallback?.sha256 : getHeader(headers, sha256MetadataHeader) ?? fallback?.sha256;
  return storedObjectSchema.parse({
    key,
    byteSize: byteSize === undefined ? undefined : Number(byteSize),
    contentType,
    sha256,
    eTag: getHeader(headers, eTagHeader),
  });
}

export class AliyunOssStorage implements StoragePort {
  constructor(
    private readonly config: AliyunOssConfig,
    private readonly client: AliyunOssSdkClient = createSdkClient(config),
    private readonly hasher: Sha256Hasher = new WebCryptoSha256Hasher(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async put(input: StoragePutRequest): Promise<StoredObject> {
    const request = storagePutRequestSchema.parse(input);
    const verification = await verifyContentSha256(request.expectedSha256, request.content, this.hasher);
    if (!verification.matches) {
      throw new Error("Refusing to upload content whose SHA-256 does not match the expected digest");
    }

    const result = await this.client.put(request.key, Buffer.from(request.content), {
      headers: {
        "Content-Type": request.contentType,
        "x-oss-meta-sha256": verification.actualSha256,
      },
    });
    return toStoredObject(request.key, result.res?.headers, {
      sha256: verification.actualSha256,
      byteSize: request.content.byteLength,
      contentType: request.contentType,
    }, true);
  }

  async head(input: string): Promise<StoredObject | null> {
    const key = storageObjectKeySchema.parse(input);
    try {
      const result = await this.client.head(key);
      return toStoredObject(key, result.res?.headers);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async signGetUrl(input: SignGetRequest): Promise<SignedGetUrl> {
    const request = signGetRequestSchema.parse(input);
    const expiresInSeconds = Math.min(request.expiresInSeconds, this.config.signedUrlTtlSeconds);
    const expiresAt = new Date(this.now().getTime() + expiresInSeconds * 1_000).toISOString();
    return {
      key: request.key,
      url: this.client.signatureUrl(request.key, { method: "GET", expires: expiresInSeconds }),
      expiresAt,
    };
  }

  async remove(input: string): Promise<void> {
    const key = storageObjectKeySchema.parse(input);
    await this.client.delete(key);
  }
}
