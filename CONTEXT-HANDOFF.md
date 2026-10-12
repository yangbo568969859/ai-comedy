# AI 漫剧 MVP：会话交接上下文

> 最后更新：2026-10-09（Asia/Shanghai）
>
> 本文件用于在新 Codex 对话中恢复工作上下文。**不包含任何 API Key、数据库密码、OSS 签名 URL 或其他密钥。** 新对话开始时先阅读根目录 `AGENTS.md` 与本文件。

## 当前目标与阶段

项目位于 `D:\ai\man`，是一个面向内部制作的 AI 漫剧 MVP：从镜头计划、参考资产、Wan 视频生成、人工审核，到私有粗剪成片。

当前已完成并可验证的链路：

1. PostgreSQL 项目/分集/镜头计划。
2. 私有 OSS 参考资产上传与预览代理。
3. Wan 2.7 R2V 生成提交、轮询、私有视频入库。
4. 三项人工审核（内容、权利、AI 标识）的追加式记录。
5. 仅允许三项均通过的视频进入私有粗剪。
6. Worker 用 FFmpeg 统一转码并按镜头顺序拼接私有 MP4。

未实现且按照 `AGENTS.md` 当前明确禁止提前实现：多租户、支付、自动模型路由、自动审核放行、复杂工作流编辑器、LoRA 训练、复杂剪辑器、推荐系统。

## 已验证的真实演示项目

项目：`沈烬 · 月下初现`

分集：`验收短章：月下初现`

三个已成功入库的视频镜头（按顺序）：

| 镜头 | Shot ID | 最新成功 Run ID | 输出 Asset ID | 质量简评 |
| --- | --- | --- | --- | --- |
| 月下回眸 | `5d3870c9-96ca-45eb-8712-073e1e8553fb` | `90e95806-e5e8-433d-9046-65cdf21531a7` | `e144891c-b0cf-4137-b743-dbd9b485d308` | 人物稳定，缓慢推近/发丝微动 |
| 侧身转向 | `4661735e-c569-4eb8-ae97-89d876718a75` | `28c9a53c-42fa-4365-9d87-23cc7c8eb85c` | `340201cc-6a50-457a-91b5-17d07761aae2` | 侧身到正面，身份一致 |
| 踏入月影 | `a0daf9c1-9ee6-4cfe-9f84-44ca7d02c4d5` | `83131d0e-c301-466d-be0d-42f7c730dcb9` | `4ca93b43-d8d9-4eed-a9b9-75d5c20b6850` | 全身迈步，手脚基本正常 |

技术规格均为竖屏 `720x1280`、`30 fps`、H.264/AAC，时长约 4–5 秒。

## 当前运行环境

截至交接时：

- Studio：`http://localhost:3001`，以 Next.js production build 运行。
- Worker：以 `pnpm --filter @ai-manju/worker start` 运行；同时消费生成队列与粗剪队列。
- PostgreSQL、Redis：由 `infra/compose.yaml` 启动。
- 本地 `.env` 已配置数据库、Redis、OSS、Wan 和 FFmpeg 的**真实值**，不得读取后输出、提交 Git 或写入文档。
- FFmpeg 已通过 Winget 安装；由于已运行进程可能不继承用户 PATH，`.env` 已使用 `FFMPEG_PATH` 与 `FFPROBE_PATH` 的绝对路径。`.env.example` 使用空值占位。

新对话第一步应只读确认：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3001,5432,6379 -ErrorAction SilentlyContinue
Get-Content artifacts/studio-runtime.out.log -Tail 30
Get-Content artifacts/worker-runtime.out.log -Tail 30
```

若 Studio 或 Worker 未运行，先构建再启动；不可打印 `.env` 内容。

## 最近修复：审核版本契约

审核接口曾连续出现两类契约问题，均已修复。

### 后端版本值错误（已修复）

原因：`apps/studio/src/server/studio-review.ts` 曾硬编码 `contractVersion: 1`，而领域层 `packages/domain/src/ids.ts` 要求字符串常量 `"v1"`。

修复：改为导入并使用 `contractVersion` 常量；新增服务端测试。

### 前端 DTO 漏字段（已修复）

用户曾看到：

```json
[{"code":"unrecognized_keys","keys":["contractVersion"],"path":["review"]}]
```

原因：`apps/studio/src/features/studio/studio-api.ts` 的前端 `studioReviewSchema` 未声明后端合法返回字段 `contractVersion: "v1"`，且使用 `.strict()`。

修复：

- 前端 Zod DTO 加入 `contractVersion: z.literal("v1")`。
- `StudioReviewDto` 同步加入 `contractVersion: "v1"`。
- `studio-api.test.ts` 增加返回真实审核 DTO 的回归测试。

验证：Studio 测试 `26/26` 通过，production build 通过，并重启了 `3001`。

注意：最后一次对第三镜头审核 GET 的直接请求返回 `{"review":null}`，即该镜头还没有审核记录；用户需在工作台根据真实判断手动录入，不能由 Agent 自动写“通过”。

## 人工审核与粗剪流程

工作台右侧存在“人工审核”和“私有粗剪”卡片。

1. 对每一个真实视频镜头，分别判断并选择内容、权利、AI 标识。
2. 点击“记录审核决定”。这会向 `asset_reviews` 追加一条不可覆盖的审核证据。
3. 三个镜头的**最新**审核记录都三项通过后，“私有粗剪”变为可提交。
4. 点击“提交粗剪”。Studio 仅投递队列；Worker 执行私有下载/拼接。
5. 完成后刷新粗剪卡片，成片由 `/api/studio/assets/<assetId>/content` 以私有代理方式播放。

任何一个镜头未通过审核或没有成功视频时，粗剪 API 应返回 HTTP `409`，不得进入队列或启动 FFmpeg。已在真实项目验证过该拒绝门禁。

## 私有粗剪实现要点

关键文件：

- `packages/domain/src/export.ts`：`EpisodeExportRequest`、不可变导出溯源契约。
- `packages/db/src/schema.ts`：`episode_exports` 表。
- `packages/db/drizzle/0004_loud_iron_lad.sql`：导出表与 append-only trigger；已迁移到本地 DB。
- `apps/worker/src/private-episode-composer.ts`：审核门禁、私有 OSS 下载、SHA-256 校验、FFmpeg、FFprobe、上传、清理。
- `apps/worker/src/episode-composition-queue.ts`：`episode-composition-v1` Worker。
- `apps/studio/src/server/studio-episode-export.ts`：服务端导出请求与资格检查。
- `apps/studio/src/features/exports/rough-cut-panel.tsx`：工作台卡片。
- `docs/runbooks/approved-rough-cut-export.md`：验收/故障处理手册。

行为：

- 先查最新人工审核，未通过时绝不签名、下载或调用 FFmpeg。
- 所有输入均使用 OSS 短时签名 URL，URL 不存数据库、不写日志。
- 下载后逐项验证 SHA-256。
- 输出统一为 `720x1280 / 30fps / H.264 / 无音频`，写入私有路径 `exports/<exportId>/master.mp4`。
- 输出 Asset 与 `episode_exports` 溯源记录使用数据库事务写入；落库失败会删除刚上传的对象；临时文件 finally 清理。
- 当前故意不合成音频，避免未审核旁白或音乐进入母版。

## 已知技术/产品结论

- 供应商采用插件化边界：业务层只使用版本化 `GenerationProvider` 契约，厂商差异限制在 `packages/providers/*`。
- 目前只启用 Wan 2.7；`.env` 中为 Seedance 预留 key/模型配置，但未接入、未启用。
- Wan 单条 5 秒视频可能排队数十分钟；页面关闭不影响 Worker/供应商任务，重新打开会从 PostgreSQL 状态恢复。
- LibTV 的节点画布属于高级领域工作流交互，不是本项目现阶段要复刻的 ComfyUI。现阶段应继续以镜头列表/审核/成片闭环为主。
- UI 基线：Next.js、Tailwind、仓库自有组件、Radix Primitives、TanStack Query；不要再引入完整的第二设计系统。

## 已知限制与下一步建议

最合理的下一批工作（在首次真实粗剪验证成功之后）：

1. 实测私有粗剪：由用户手动审核三镜头，通过后生成约 13 秒无声 MP4；检查镜头顺序、切点、时长、私有播放。
2. 将粗剪结果纳入发布候选视图，但仍保持“人工审核后才能发布”，不实现自动发布。
3. 添加基础音频/字幕资产计划与人工审核模型（先数据/流程，后合成）。
4. 根据真实 Wan 成本与成功率，完善基准评测套件；Seedance 保持为可插拔备选，不要抢先接入。
5. 在真实工作量证据足够后，再评估高层节点图/时间线，而不是复制 ComfyUI。

## 必须遵循的工程规则

根目录 `AGENTS.md` 是权威约束。最重要的几条：

- `packages/domain` 只能依赖 Zod。
- 生成 Run 请求快照不可变，执行变更只能追加事件。
- 供应商 SDK 类型/原始 payload 不可泄漏出 provider adapter。
- 审核、生成和发布状态必须分离；自动评估不可自动放行。
- 私有媒体、短签 URL；密钥不得进入 Git、日志、异常或 API DTO。
- 每个任务必须给出可执行验证及结果。

## 近期验证命令

```powershell
pnpm typecheck
pnpm test
pnpm --filter @ai-manju/studio build
pnpm --filter @ai-manju/db db:check
```

数据库迁移执行前，需要将 `.env` 的 `DATABASE_URL` 显式导入当前 PowerShell 进程；不要把 URL 打印到终端：

```powershell
$databaseLine = Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length)
pnpm --filter @ai-manju/db db:migrate
```

