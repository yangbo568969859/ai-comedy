import { createDatabaseConnection, episodes, findAssetsByIds, series, shotReferenceAssets, shots } from "@ai-manju/db";
import { config as loadEnvironment } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseShenjinDemoAssets, shenjinDemoPlan } from "../src/server/shenjin-demo.js";

loadEnvironment({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL must be configured before seeding the Shenjin validation project.");
}

const seriesId = "13c1486b-9a3c-438f-9a28-0d6f5c94743d";
const episodeId = "b27c8f35-6f9f-4d49-b96c-4b59a0d59f1c";
const shotIds = [
  "5d3870c9-96ca-45eb-8712-073e1e8553fb",
  "4661735e-c569-4eb8-ae97-89d876718a75",
  "a0daf9c1-9ee6-4cfe-9f84-44ca7d02c4d5",
] as const;

async function main(): Promise<void> {
  const assetConfig = parseShenjinDemoAssets(process.env);
  const assetIds = [assetConfig.characterAnchorAssetId, assetConfig.faceAnchorAssetId, assetConfig.styleReferenceAssetId];
  const connection = createDatabaseConnection(databaseUrl);
  try {
    const storedAssets = await findAssetsByIds(connection.db, assetIds);
    if (storedAssets.length !== assetIds.length || storedAssets.some((asset) => asset.kind !== "image" || !asset.contentType.startsWith("image/"))) {
      throw new Error("All configured Shenjin assets must already exist as private image assets.");
    }

    await connection.db.transaction(async (transaction) => {
      await transaction.insert(series).values({ id: seriesId, title: shenjinDemoPlan.title, logline: shenjinDemoPlan.logline }).onConflictDoNothing();
      await transaction.insert(episodes).values({ id: episodeId, seriesId, sequence: 1, title: shenjinDemoPlan.episodeTitle, synopsis: "仅用于单角色、单场景的 Wan 2.7 付费冒烟验证；先生成镜头一，之后再按审核结果推进。" }).onConflictDoNothing();
      await transaction.insert(shots).values(shenjinDemoPlan.shots.map((shot, index) => ({
        id: shotIds[index]!, episodeId, sequence: index + 1, ...shot,
      }))).onConflictDoNothing();

      for (const shotId of shotIds) {
        await transaction.insert(shotReferenceAssets).values([
          { shotId, assetId: assetConfig.characterAnchorAssetId, role: "character_anchor", sequence: 1, note: "沈烬四视图角色锚点", attachedBy: "shenjin-validation-seed" },
          { shotId, assetId: assetConfig.faceAnchorAssetId, role: "character_anchor", sequence: 2, note: "沈烬正面脸部锚点", attachedBy: "shenjin-validation-seed" },
          { shotId, assetId: assetConfig.styleReferenceAssetId, role: "style_reference", sequence: 3, note: "沈烬月下国风风格参考", attachedBy: "shenjin-validation-seed" },
        ]).onConflictDoNothing();
      }
    });
    process.stdout.write(`seeded Shenjin validation project ${seriesId} with ${shotIds.length} shots\n`);
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown seed error"}\n`);
  process.exitCode = 1;
});
