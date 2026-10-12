import { createDatabaseConnection, episodes, series, shots } from "@ai-manju/db";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL must be configured before seeding demo studio data.");
}

const demoSeriesId = "10f9ca34-5919-4fc5-b4f1-8f7c884e5b01";
const demoEpisodeId = "20f9ca34-5919-4fc5-b4f1-8f7c884e5b02";
const demoShotIds = [
  "30f9ca34-5919-4fc5-b4f1-8f7c884e5b03",
  "40f9ca34-5919-4fc5-b4f1-8f7c884e5b04",
] as const;

async function main(): Promise<void> {
  const connection = createDatabaseConnection(databaseUrl);
  try {
    await connection.db.insert(series).values({
    id: demoSeriesId,
    title: "工作台演示项目",
    logline: "用于验证 AI 漫剧工作台 PostgreSQL 读取边界的开发数据。",
    }).onConflictDoNothing();

    await connection.db.insert(episodes).values({
    id: demoEpisodeId,
    seriesId: demoSeriesId,
    sequence: 1,
    title: "第一集：雨夜来客",
    synopsis: "演示镜头计划，不含任何真实媒体资产。",
    }).onConflictDoNothing();

    await connection.db.insert(shots).values([
    {
      id: demoShotIds[0],
      episodeId: demoEpisodeId,
      sequence: 1,
      title: "便利店外景",
      script: "深夜细雨，一位女孩停在便利店门前。",
      visualPrompt: "日系动画风格，细雨夜景，便利店灯箱，固定机位。",
      durationSec: 5,
    },
    {
      id: demoShotIds[1],
      episodeId: demoEpisodeId,
      sequence: 2,
      title: "收银台抬头",
      script: "店员抬头看向门口，玻璃上的水珠被暖光照亮。",
      visualPrompt: "便利店收银台，中近景，暖色顶灯，玻璃雨滴。",
      durationSec: 4,
    },
    ]).onConflictDoNothing();

    process.stdout.write(`seeded demo studio project ${demoSeriesId}\n`);
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown seed error"}\n`);
  process.exitCode = 1;
});
