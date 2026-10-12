# 审核通过镜头的粗剪导出验收

## 目的与范围

本手册定义 `沈烬 · 月下初现` 三个已生成镜头从人工审核到私有粗剪
成片的验收标准。它不是发布流程，也不替代发行平台、成片调色、字幕制作
或复杂时间线编辑。

本批次的唯一交付物是一个私有 MP4 粗剪资产，以及能够从该资产追溯到每一
个源视频、生成运行和人工审核决定的记录。

## 不可绕过的门槛

每个输入镜头必须同时满足以下条件，才允许进入导出候选集：

| 门槛 | 通过条件 | 拒绝或待修改时的结果 |
| --- | --- | --- |
| 输出存在 | `GenerationRun` 的终态为 `succeeded`，且恰好解析到该 run 的视频输出资产 | 不进入候选集 |
| 内容审核 | `content = approved` | 不进入候选集 |
| 权利审核 | `rights = approved` | 不进入候选集 |
| AI 标识 | `labeling = approved` | 不进入候选集 |
| 媒体可处理 | FFprobe 可读取视频、时长大于 0，且流中存在视频 | 导出失败并记录原因，绝不生成半成品发布候选 |

审核判断取每个 `(assetId, sourceRunId)` 的最新追加式 `AssetReview` 记录。
任一项为 `rejected` 时状态为 `rejected`；任一项为 `needs_changes` 时状态为
`pending`。不能用“生成成功”“质量看起来不错”或前端本地状态替代三项审核。

## 当前实现边界

以下能力已存在，可作为本批次的输入和证据：

- `packages/domain/src/review.ts` 定义三项审核和派生状态。
- `apps/studio/src/server/studio-review.ts` 只允许对某次运行实际输出的视频写入
  追加式审核记录。
- `apps/studio/src/app/api/studio/generation-runs/[runId]/review/route.ts` 提供审核
  查询与写入 API。
- Wan 输出通过 `apps/worker/src/wan-runtime.ts` 入库为私有 OSS 对象；数据库仅保存
  `storageKey` 和哈希，不保存公开 URL。

以下能力在开始导出实现前仍不存在，验收时不得假定已经具备：

- `packages/media` 尚没有 FFmpeg/FFprobe 命令封装、媒体探测 DTO 或拼接实现。
- 没有“成片导出”领域实体、导出审计记录、队列任务、API 或工作台按钮。
- 当前 `ReviewPanel` 仍显示“不会写入数据库”的旧提示，尚未连接已有审核 API。
- `infra/compose.yaml` 只定义 PostgreSQL 和 Redis；没有固定版本、可复现的 Worker
  镜像，因而不能把机器上全局安装的 FFmpeg 当作部署保证。

因此，导出实现必须先补齐这些边界，不能仅在 Studio 进程里执行一次 shell 命令。

## 推荐的实现合同

导出是 worker 的异步任务，不是 Next.js 请求生命周期中的子进程。建议新增一个
版本化的 `RoughCutExport` 请求快照和追加式事件流，并至少冻结：

- `episodeId`、按 `shots.sequence` 升序排列的 `sourceRunId` 与 `assetId`；
- 每项被采纳的 `AssetReview` ID / 决定时间；
- FFmpeg 版本、导出配置版本、目标 `9:16 / 720p / H.264 + AAC`；
- 每个源资产的 SHA-256，以及最终输出的 SHA-256；
- 创建人、创建时间、失败原因码和私有输出资产 ID。

不要从“当前最新视频”或“当前最新审核”在后台重新推导输入。创建导出任务时必须
先生成并持久化候选集快照；后续审核变化不应静默改变一个已排队或已完成的导出。

建议的最小失败原因码：

```text
export_no_approved_shots
export_review_gate_failed
export_ffmpeg_unavailable
export_probe_failed
export_unsupported_media
export_normalize_failed
export_concat_failed
export_storage_upload_failed
export_output_verification_failed
```

错误记录不得包含 OSS AccessKey、签名 URL、完整供应商 URL 或媒体原始字节。

## 实施验收测试

实现完成后，自动化测试至少覆盖下面的业务结果；这些测试应放在 domain / worker
服务层，不依赖浏览器或真实 Wan 调用。

1. 三个审核决定均为 `approved` 的输出会进入候选集。
2. `needs_changes`、`rejected`、缺少审核记录、输出不存在、run 未成功的任一情况，
   都会阻止创建导出任务。
3. 候选集按 `episodes.sequence`、`shots.sequence` 排序，而不是按创建时间、资产 ID
   或完成时间排序。
4. 任务创建后，即使产生新的审核记录或新的生成运行，已冻结的导出输入不改变。
5. FFmpeg / FFprobe 不存在、非零退出、探测到无视频流、正常化失败、拼接失败和
   OSS 写入失败都会产生可追溯的失败事件，且不创建可发布输出。
6. 成功时，输出元数据中的时长接近源片段时长之和；容许值应仅覆盖帧边界误差，
   不能静默丢失整段镜头。
7. 输出对象保持私有；客户端只能经已有受控媒体代理或短时签名机制读取，导出 DTO
   不返回 `storageKey`、AccessKey 或签名 URL。

## 本地可复现验收

### 1. 环境检查

在仓库根目录执行：

```powershell
ffmpeg -hide_banner -version
ffprobe -hide_banner -version
docker compose --env-file .env -f infra/compose.yaml ps
pnpm typecheck
```

期望：两个二进制均退出 `0`；PostgreSQL、Redis 为健康状态；类型检查通过。正式
Worker 镜像准备后，应在**该镜像内**重复前两条检查，而不是只验证开发机 PATH。

### 2. 查找三个真实输出

以下命令只读取 Studio API，不显示私有对象键或签名 URL：

```powershell
$project = Invoke-RestMethod http://localhost:3001/api/studio/project
$episode = $project.project.episodes | Select-Object -First 1
$runs = foreach ($shot in $episode.shots | Sort-Object sequence) {
  $run = Invoke-RestMethod "http://localhost:3001/api/studio/shots/$($shot.id)/generation-runs"
  [PSCustomObject]@{
    sequence = $shot.sequence
    title = $shot.title
    shotId = $shot.id
    runId = $run.run.runId
    status = $run.run.status
    outputAssetId = $run.run.outputAssetId
  }
}
$runs | Format-Table -AutoSize
```

期望：三行均为 `succeeded`，每行都有 `runId` 与 `outputAssetId`。少于三行时，先
补齐生成或明确选择一个较短的验收范围；不得让导出隐式跳过缺失镜头。

### 3. 写入并复查三项人工审核

对每个输出，在确认人物、素材权利和 AI 标识后，使用审核 API 写入决定。下面仅是
API 验收示例；实际 UI 接入后应产生等价请求。

```powershell
$decision = @{ content = "approved"; rights = "approved"; labeling = "approved"; note = "沈烬 MVP 粗剪验收" } | ConvertTo-Json
foreach ($item in $runs) {
  Invoke-RestMethod -Method Post `
    -ContentType "application/json" `
    -Body $decision `
    -Uri "http://localhost:3001/api/studio/generation-runs/$($item.runId)/review?assetId=$($item.outputAssetId)"
}
foreach ($item in $runs) {
  Invoke-RestMethod "http://localhost:3001/api/studio/generation-runs/$($item.runId)/review?assetId=$($item.outputAssetId)"
}
```

期望：每条响应的 `review.status` 为 `approved`。本地 MVP 的 `decidedBy` 会使用
`STUDIO_REVIEWER_ID`，未配置时为 `local-studio-reviewer`；生产环境必须使用经过
认证的审核人身份，不能信任浏览器提交的任意名称。

### 4. 导出任务的成功断言

在导出 API/UI 落地后，使用指定 `episodeId` 创建一次导出任务。验收记录必须显示：

- 输入镜头严格是 `01 月下回眸`、`02 侧身转向`、`03 踏入月影`；
- 输入 run / asset / review 证据与创建任务时的快照一致；
- 任务事件经历 `queued -> running -> succeeded`，或出现前述明确失败码；
- 输出为私有 MP4，且浏览器播放路径不暴露 OSS 对象键或签名 URL；
- FFprobe 报告一个视频流，画面为 `720x1280`，时长接近 `5.04 + 4.04 + 4.04 = 13.12`
  秒（按实际探测的源时长计算，并在验收记录中写明容许帧误差）；
- 输出 SHA-256 与对象上传后复算值一致。

### 5. 强制失败演练

至少执行一次不产生新 Wan 费用的失败演练：把任一镜头的三项审核之一记录为
`needs_changes`，再尝试创建同一集导出。期望返回 `export_review_gate_failed`，不创建
输出资产。恢复为三项 `approved` 后，应创建**新的**导出任务，不覆盖失败记录。

FFmpeg 不存在或命令失败的演练仅在隔离开发环境执行；不要通过移除全局安装影响
其他工作。应通过导出服务注入的命令执行器或临时测试 double 模拟，并验证失败事件。

## 人工视觉验收清单

导出成功不代表作品发布通过。播放粗剪时人工确认：

- 镜头顺序与脚本一致，没有黑帧、重复帧或漏镜头；
- 每个视频的 AI 标识在拼接、缩放和裁切后仍存在且可见；
- 镜头交界处没有异常静音、破音或时间轴重叠；
- 人物身份、服装、月下庭院和动作衔接达到本轮样片要求；
- 输出仍只是内部验收候选，任何对外发布还需单独的发布记录与渠道审核。

## 当前架构阻碍清单

实施者应先解决下列明确缺口，再宣称“审核与成片导出完成”：

1. `apps/studio/src/features/studio/studio-workspace-live.tsx` 的 `ReviewPanel`
   回调仍是本地 notice，没有调用已有 review API；
   `apps/studio/src/features/reviews/review-decision-panel.tsx` 也明确提示不会写库。
2. `packages/media/src` 只包含资产元数据和 SHA-256 校验，没有 FFmpeg 端口；
   FFmpeg 子进程只能位于 Node/worker 适配层，不能进入纯 domain。
3. `apps/worker/src/wan-runtime.ts` 只处理 Wan 输出入库，没有媒体探测、标准化、
   拼接或导出队列消费者。
4. `packages/db/src/schema.ts` 没有导出任务、冻结输入或最终成片审计表；仅有
   `asset_reviews` 不足以证明一个输出由哪些审核通过的视频组成。
5. `infra/compose.yaml` 没有包含 FFmpeg 的 worker 服务 / 镜像；全局安装对本机可用，
   对可部署环境不可复现。
