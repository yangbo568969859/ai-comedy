import { benchmarkCases, benchmarkSuites, createDatabaseConnection } from "@ai-manju/db";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL must be configured before seeding a benchmark suite.");
}

const seriesId = "10f9ca34-5919-4fc5-b4f1-8f7c884e5b01";
const suiteId = "50f9ca34-5919-4fc5-b4f1-8f7c884e5b01";

const cases = [
  ["B01", "portrait", "角色特写", "保持角色脸部、发型、服装不变，角色从画面外收回目光并轻微眨眼。", "9:16", 4],
  ["B02", "dialogue", "雨夜聆听", "雨夜回廊中的中近景，角色无声聆听并克制地做出反应，场景和服装保持一致。", "9:16", 5],
  ["B03", "turn", "转身面对镜头", "角色从三分之二背面平稳转身面向镜头，保持脸型、发型和服装细节。", "9:16", 4],
  ["B04", "prop_interaction", "令牌交互", "角色抬起已批准的暗银令牌观察，再自然放回腰间高度。", "9:16", 5],
  ["B05", "action", "克制前行", "角色向前迈出一步，衣袖自然摆动；不得出现战斗、武器或第二角色。", "9:16", 4],
  ["B06", "scene_transition", "门内到雨夜", "角色从昏暗门内移步至灯笼照亮的雨夜外景，人物与场景连续。", "9:16", 5],
  ["B07", "portrait", "横画幅焦点转移", "电影感横画幅近景，焦点从前景灯笼平稳转移至角色面部。", "21:9", 4],
  ["B08", "dialogue", "双人构图", "角色与一个不可辨认的剪影同框对话，只评价锚定主角的身份稳定和构图遵从。", "9:16", 5],
  ["B09", "action", "雨中行走", "角色穿过浅雨，斗篷和衣角有克制自然的运动；不要突然切镜。", "9:16", 5],
  ["B10", "first_last_frame", "首尾帧衔接", "在已批准首帧和尾帧之间，以一次平静转身完成连续衔接。", "adaptive", 5],
] as const;

async function main(): Promise<void> {
  const connection = createDatabaseConnection(databaseUrl);
  try {
    await connection.db.insert(benchmarkSuites).values({
      id: suiteId,
      seriesId,
      version: "wan-seedance-10-shot-v1",
      name: "Wan 与 Seedance 十镜头基准",
      description: "仅定义受控实验，不代表真实供应商任务已经提交。",
    }).onConflictDoNothing();

    await connection.db.insert(benchmarkCases).values(cases.map(([code, category, title, prompt, ratio, durationSec], index) => ({
      id: `60f9ca34-5919-4fc5-b4f1-${String(index + 1).padStart(12, "0")}`,
      suiteId,
      sequence: index + 1,
      code,
      category,
      title,
      prompt: `${prompt}\n输出比例：${ratio}；目标时长：${durationSec} 秒。`,
      expectedCandidateCount: 3,
    }))).onConflictDoNothing();

    process.stdout.write(`seeded benchmark suite ${suiteId} with ${cases.length} cases\n`);
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown seed error"}\n`);
  process.exitCode = 1;
});
