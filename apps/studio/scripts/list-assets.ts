import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabaseConnection, listAssetsForInspection } from "@ai-manju/db";
import { AliyunOssStorage, parseAliyunOssConfig } from "@ai-manju/storage";

config({ path: "../../.env" });
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");
async function main() {
  const connection = createDatabaseConnection(databaseUrl);
  try {
    const rows = await listAssetsForInspection(connection.db);
    const requestedAssetIds = (process.env.INSPECT_ASSET_IDS ?? "")
      .split(",")
      .map((assetId) => assetId.trim())
      .filter((assetId) => assetId.length > 0);

    if (requestedAssetIds.length > 0) {
      const outputDirectory = resolve(process.cwd(), "artifacts", "asset-inspection");
      const storage = new AliyunOssStorage(parseAliyunOssConfig(process.env));
      await mkdir(outputDirectory, { recursive: true });

      for (const assetId of requestedAssetIds) {
        const asset = rows.find((row) => row.id === assetId);
        if (asset === undefined) throw new Error(`asset not found: ${assetId}`);
        if (!asset.contentType.startsWith("image/")) throw new Error(`asset is not an image: ${assetId}`);

        const signed = await storage.signGetUrl({ key: asset.storageKey, expiresInSeconds: 300 });
        const response = await fetch(signed.url);
        if (!response.ok) throw new Error(`could not download asset: ${assetId}`);
        const extension = asset.contentType === "image/jpeg" ? "jpg" : "png";
        await writeFile(resolve(outputDirectory, `${asset.id}.${extension}`), Buffer.from(await response.arrayBuffer()));
      }
    }
    process.stdout.write(`${JSON.stringify(rows.map((row) => ({ ...row, byteSize: row.byteSize.toString() })))}\n`);
  } finally {
    await connection.close();
  }
}
void main();
