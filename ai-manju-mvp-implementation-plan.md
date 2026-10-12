# AI 漫剧内部 MVP 实施计划

> 版本：2026-10-04  
> 目标：10 周内验证“20 镜头基准集 + 一季原创样片 + 可追溯生产记录”是否能形成可复用的 B 端生产能力。  
> 当前范围：**仅内部自制、原创/明确授权素材**。不开放注册、用户上传、真人肖像/声纹克隆、公开 UGC 或自建分发社区。

## 是否可以开工

**可以。** 现在开始的是内部生产控制台，不是 SaaS，也不是内容分发平台。首个可验证闭环如下：

`镜头规格 -> 参考资产 -> 提交生成 -> 保存原始运行证据 -> 人工审片 -> 导出盲评包/带标识预览片`

首周完成的定义不是“页面漂亮”，而是同一套 20 镜头可在一个真实云模型与 MockProvider 上端到端运行，所有候选均能追溯输入、模型、成本、输出和人工结论。

## 固定技术决策

- 单仓库 TypeScript：Next.js（内部后台/API）+ PostgreSQL + Drizzle ORM。
- 异步队列：Redis + BullMQ；对象存储：开发期及首个云环境使用私有阿里云 OSS，生产仍通过可替换的对象存储边界支持 S3/OSS/R2。
- 媒体：FFmpeg/FFprobe；导出期叠加显式 AI 标识，写入并验证文件元数据。
- 生成：第一迭代仅 `MockProvider + 1 个已获得账号、已核对条款的云 Provider`。第二迭代再接 Wan2.2/ComfyUI worker。Seedance 2.5、Vidu Q3 等是 benchmark 候选，不是没有账号和条款核验时的开发阻塞。
- 运行形态：Docker Compose。禁止 Kubernetes、微服务、GraphQL、工作流编辑器、支付、多人协作和自动路由。

## 先决条件（第 0 天）

以下任何一项未完成，不能提交真实生成任务：

1. 建一个新私有仓库，确认 Node LTS、Docker、FFmpeg 可用。
2. 选定一个云 Provider，保存其 API 条款、模型名称、商用/输出权、数据保留与地域说明的快照。
3. 创建原创剧本、角色、场景和声音/音乐素材的权利台账；权利状态为未知、过期或非商用的素材不得进入队列。
4. 创建开发用 API key、私有 OSS Bucket、最小权限 RAM AccessKey 和数据库；密钥只在环境变量/密钥管理中存在，不能入库、日志或 Git。
5. 确认目标发布平台的当前提审、AI 标识、发布声明与账号主体要求。此阶段不假定个人/低预算自动适用任何备案类别。

## 核心领域契约

`Shot` 表示创作意图，`GenerationRun` 表示一次不可变执行尝试。Provider 差异只能留在 adapter 内。

```text
Series -> Episode -> Shot -> GenerationRun -> AssetVersion -> ReviewDecision
                                      -> CostLedger
                                      -> LabelingExport -> ReleaseManifest

CharacterProfile / SceneProfile / LicenseRecord 为 Shot 和 AssetVersion 提供输入约束。
```

每次 `GenerationRun` 至少记录：

```text
provider, providerModel, modelVersion, workflowVersion, requestJson,
inputAssetHashes, promptVersion, seed, idempotencyKey, providerJobId,
estimatedCost, actualCost, startedAt, finishedAt, failureReason, outputAssetHash
```

不可省略的规则：

- 前端只能发命令，worker 才能推进状态；状态为 `draft -> queued -> submitting -> provider_queued/running -> succeeded/failed/canceled -> review_pending -> approved/rejected`。
- 重试必须新建 `GenerationRun` 并指向 `retry_of_run_id`，不覆盖失败记录。
- `succeeded` 仅代表拿到媒体，不代表可发布；最终必须人工“内容 + 版权 + 标识”三项通过。
- 预算检查使用保守的预估费用；账单回执到达后写入实际费用。提交超时先恢复或人工对账，禁止盲目重复提交。

## 分批委派与验收

所有子任务按目录边界执行；主任务负责合并、代码审查、验收和后续任务派发。每批结束前不得启动依赖它的下一批。

| 批次 | 负责人任务 | 文件边界 | 产出与验收 | 主任务审查重点 |
|---|---|---|---|---|
| 0 | 主任务：写 ADR、冻结领域契约、初始化任务板 | `docs/adr/`, `packages/domain/` | Zod 类型、状态迁移测试、Provider 接口 | 不接受业务层直接依赖任一家 SDK |
| 1A | 子 agent：仓库与本地基础设施 | `infra/`, 根配置 | Docker Compose 可启动 Postgres、Redis；健康检查通过 | 不得含真实密钥、不得引入云资源副作用 |
| 1B | 子 agent：数据库与迁移 | `packages/db/` | Drizzle 迁移创建核心表，空库可迁移/回滚 | JSONB 仅放模型可变参数；外键与不可变 run 记录正确 |
| 1C | 子 agent：资产/许可证服务 | `packages/media/`, `packages/compliance/rights/`, `packages/storage/` | 私有 OSS 上传、下载、短时签名 URL、SHA-256、素材权利状态 gate | 不得仅信任文件名或 URL；非授权状态必须阻断 |
| 2A | 子 agent：MockProvider 和 worker | `apps/worker/`, `packages/providers/mock/` | 排队、轮询、失败、取消、有限重试可演示 | 幂等键、失败不无限重试、状态不被 UI 直接修改 |
| 2B | 子 agent：内部工作台 UI | `apps/studio/` | Series/Episode/Shot、上传参考图、提交/审片页面 | 不做登录、协作、时间线、工作流编辑器 |
| 3 | 子 agent：一个真实 Provider adapter | `packages/providers/<provider>/` | 用受控测试镜头跑通一次真实任务及成本记录 | 先审条款和脱敏日志；API 超时不可重复扣费 |
| 4 | 子 agent：盲评与导出 | `packages/eval/`, `packages/compliance/export/` | 20 镜头匿名盲评包、FFmpeg 预览片、manifest | 不伪造隐式标识；应解析验证导出文件实际结果 |
| 5 | 主任务：集成、威胁检查、试运行 | 跨模块 | 一次从空环境到 Mock 端到端演示，再跑真实 Provider | 审依赖许可、迁移、失败恢复、媒体权限和审计完整性 |

## 10 周节奏

### 第 1 周：可复现生成基础

- 完成批次 0、1A、1B、1C、2A。
- 冻结 20 个 benchmark 镜头：对白、动作、转场、多角色各 5 个；固定输入资产 hash、画幅、时长和评分 rubric。
- 退出条件：空环境可启动，Mock 任务完整走到人工审片，失败与重试均可追溯。

### 第 2--3 周：内部工作台与首个真实任务

- 完成 2B、3；使用一个真实云 provider 跑 20 镜头基准集。
- 先人工指定 provider；不做自动路由/fallback。
- 退出条件：每个成功候选都可找到请求、输入资产、供应商回执、成本和输出 hash；不存在永久 `running` 任务。

### 第 4--5 周：导出与一集样片

- 完成 4 和 5；生产 60--90 秒样片。
- 人工审片固定记录四项 1--5 分：角色一致性、分镜遵从、运动质量、发布安全。
- 退出条件：可导出匿名盲评包、带显式 AI 标识的竖版 MP4 和溯源 manifest；导出验证失败时阻断发布包。

### 第 6--7 周：小季与模型选择

- 生产 8--12 集小季，或在样片反馈不佳时只迭代剧本和资产体系。
- 接入第二个云 provider 或 Wan/ComfyUI worker，运行同一 benchmark suite 的新版本。
- 主力选择加权：角色一致性 35%、分镜/转场 25%、音画 15%、有效秒成本 15%、交付时间/失败率 10%。评分界面隐藏 provider 名称与成本。

### 第 8--9 周：真实生产压力测试与客户发现

- 用内部工具完成一次完整小季；不以播放量作为唯一结论。
- 与 3 家小工作室做问题访谈，并在获得书面素材授权后用 demo 跑一次其真实工作流。
- 退出条件：至少一个问题被重复验证，并出现试用或预付意向；否则不做 SaaS 功能扩张。

### 第 10 周：方向决策

- 内容留存和生产成本均有改善：继续内容验证。
- 工作室重复要求资产管理、审片或合规导出：产品化该单点。
- 两者都没有证据：转 B 端承制服务，保持内部工具为生产力，不再扩展产品面。

## 发布前合规门

内部测试时也保留留痕，但只有通过以下 gate 才能形成发布包：

1. 所有剧本、图片/视频、音乐、字体、音色都有权利来源、使用范围、有效期和证据 hash。
2. 每个模型、权重、LoRA、API 的版本、许可证/条款、商用状态、数据保留/训练条款、地域和复核时间已入库。
3. 最终视频有可见 AI 提示，并按 `GB 45438-2025`/标识办法写入和验证相关文件元数据；平台转码可能移除元数据，因此显式标识和发布侧声明不可省。
4. 人工内容、版权、标识三项审核均通过；VLM 只可提示或拦截，不能自动放行。
5. 导出包保存源文件和导出文件 hash、渲染配置、模型版本、发布平台、账号、AI 声明、时间及平台回执/节目编号（如适用）。

发布前必须向目标平台和律师书面确认：该剧的分类/审核路径、账号主体要求、AI 标识的具体提交规则、特殊题材边界，以及未来开放用户上传/生成服务时是否触发额外义务。

## 明确不做

- 多租户、注册/登录、支付、团队协作、客户账单。
- 自动模型路由、自动重跑、自动 VLM 放行、实时 webhook 和复杂 DAG。
- LoRA 训练、ComfyUI 工作流编辑器、原生 NLE 时间线、多人打斗/口型专项系统。
- 推荐模型或内容社区。没有合规内容池、真实行为数据和分发入口前，这不会形成壁垒。

## 最终验收清单

- [ ] 一条命令启动 PostgreSQL、Redis 并执行迁移；私有 OSS 上传/下载/签名读取验证通过。
- [ ] Mock 流程从镜头创建到审片可端到端运行。
- [ ] 一个真实 Provider 完成至少一条受控镜头任务，且成本和原始回执可查询。
- [ ] 20 个固定 benchmark 镜头能导出匿名评分包与完整溯源数据。
- [ ] 成功、失败、取消、重试、预算耗尽均有可验证记录。
- [ ] 可导出带显式 AI 标识、元数据验证结果和 manifest 的竖版预览片。
- [ ] 所有发布候选都有人类内容、版权、标识三项结论。
