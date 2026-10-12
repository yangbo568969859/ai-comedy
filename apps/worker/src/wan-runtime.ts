import { createHash, randomUUID } from "node:crypto";

import { assets, type DatabaseConnection } from "@ai-manju/db";
import { parseWanConfig, WanProvider, type WanMediaResolver, type WanOutputIngestor } from "@ai-manju/provider-wan";
import { AliyunOssStorage, parseAliyunOssConfig, type StoragePort } from "@ai-manju/storage";
import { inArray } from "drizzle-orm";

const generatedVideoMaximumBytes = 500 * 1024 * 1024;

export class PostgresWanMediaResolver implements WanMediaResolver {
  constructor(private readonly database: DatabaseConnection, private readonly storage: StoragePort) {}

  async resolve(assetIds: readonly string[], expiresInSeconds: number) {
    if (assetIds.length === 0) return [];
    const records = await this.database.db
      .select({ id: assets.id, storageKey: assets.storageKey, contentType: assets.contentType })
      .from(assets)
      .where(inArray(assets.id, [...assetIds]));
    const byId = new Map(records.map((record) => [record.id, record]));
    return Promise.all(assetIds.map(async (assetId) => {
      const record = byId.get(assetId);
      if (record === undefined) throw new Error("Wan input asset was not found");
      if (!record.contentType.startsWith("image/") && !record.contentType.startsWith("video/")) {
        throw new Error("Wan input asset must be an image or video");
      }
      const signed = await this.storage.signGetUrl({ key: record.storageKey, expiresInSeconds });
      return { assetId, contentType: record.contentType, url: signed.url };
    }));
  }
}

export class PrivateWanOutputIngestor implements WanOutputIngestor {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly storage: StoragePort,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async ingest(input: { runId: string; providerJobId: string; downloadUrl: string }): Promise<{ assetId: string; sha256: string }> {
    const source = new URL(input.downloadUrl);
    if (source.protocol !== "https:") throw new Error("Wan output URL must use HTTPS");
    const response = await this.fetchImplementation(source, { redirect: "error" });
    if (!response.ok) throw new Error(`Wan output download failed (${response.status})`);
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > generatedVideoMaximumBytes) {
      throw new Error("Wan output exceeds the configured size limit");
    }
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.byteLength === 0 || content.byteLength > generatedVideoMaximumBytes) {
      throw new Error("Wan output has an invalid size");
    }
    const sha256 = createHash("sha256").update(content).digest("hex");
    const assetId = randomUUID();
    const storageKey = `generated/${input.runId}/${assetId}.mp4`;
    await this.storage.put({ key: storageKey, content, contentType: "video/mp4", expectedSha256: sha256 });
    try {
      await this.database.db.insert(assets).values({
        id: assetId,
        kind: "video",
        storageKey,
        sha256,
        contentType: "video/mp4",
        byteSize: BigInt(content.byteLength),
        sourceRunId: input.runId,
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
    return { assetId, sha256 };
  }
}

/** Creates the production Wan adapter from explicit environment values. */
export function createWanProvider(environment: Record<string, string | undefined>, database: DatabaseConnection): WanProvider {
  const wanConfig = parseWanConfig(environment);
  const storage = new AliyunOssStorage(parseAliyunOssConfig(environment));
  return new WanProvider({
    config: wanConfig,
    mediaResolver: new PostgresWanMediaResolver(database, storage),
    outputIngestor: new PrivateWanOutputIngestor(database, storage),
  });
}
