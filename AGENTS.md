# AI 漫剧内部 MVP：工程约束

## 架构边界

- `packages/domain` 是纯 TypeScript 领域层：只能依赖 Zod；不得导入 Next.js、数据库 ORM、队列、HTTP SDK、Node 文件 API 或任一模型供应商 SDK。
- UI/API、worker、provider adapter、媒体处理、数据库与合规导出必须依赖 domain，不能反向依赖。
- `GenerationRun` 的提交请求快照不可修改。实时执行变化以追加式 `GenerationRunEvent` 表达；重试必须创建新的 run 并关联原 run。
- 生成执行状态与资产审核状态分离：获取输出不代表可发布；只有人工内容、权利、标识三项均通过，资产才能进入发布包。
- 供应商差异只存在于 `packages/providers/*` adapter。业务层只使用版本化的 `GenerationProvider` 契约，不能泄漏厂商 SDK 类型或原始 payload。

## 技术选择

- 优先选用行业主流、维护活跃、可替换的技术；当前基线是 TypeScript、pnpm workspace、Zod、Vitest、Next.js、PostgreSQL、Drizzle、Redis/BullMQ、Docker Compose、S3-compatible storage 与 FFmpeg。
- 新增会影响架构、数据兼容性、部署或许可证的技术前，先写 ADR；有两个以上合理选择且无法从现有 ADR 推导时，提出取舍由用户决定。
- 不因“开源”默认可商用。代码、模型权重、LoRA、自定义节点、字体、音频和素材均须单独登记许可证与授权状态。

## 前端工作台

- `apps/studio` 使用 Tailwind CSS、仓库自有的 UI 组件和 Radix Primitives。Radix 只负责可访问的交互行为；Tailwind 负责视觉样式。不得同时引入第二套完整设计系统或 Radix Themes。
- 通用 UI 基元放在 `apps/studio/src/components/ui/`；业务组件按 `features/<feature>/` 组织。路由页面仅负责组合和服务端读取，不能承载业务状态机、数据库访问或 Provider 调用。
- Server Component 负责服务端数据读取，Client Component 只处理交互。跨边界只传经过 Zod 校验的 DTO，不传 ORM 行对象、环境变量、签名 URL 或供应商原始响应。
- 业务组件不得复制 Button、Dialog、Select、Tabs、Toast 等通用交互控件；优先复用 `components/ui` 中受控组件。图标使用 Lucide；只有图标的按钮必须提供 `aria-label` 和 tooltip。
- 颜色、间距、圆角、阴影与状态样式必须来自语义化设计 token。业务 JSX 不得使用任意色值或为同一语义重复定义 Tailwind class；状态不得只靠颜色传达。
- 所有异步和表单界面必须覆盖 loading、empty、error、disabled 和 success 状态。复杂表单以 Zod 契约为准，并使用 `react-hook-form` 与 Zod resolver 管理。
- 可交互浮层、菜单、对话框、选择器和标签页必须支持键盘操作与焦点管理；桌面与移动视口均不得出现文字截断后遮挡关键操作。
- 每个 feature 至少有状态或交互测试；关键工作台路由必须在桌面和移动视口完成视觉验收。开发 fixture 可以存在，但必须显式标记为 Mock，不能伪装成已持久化或已调用真实供应商。

## 数据与安全

- 所有外部 JSON 在边界用 Zod 解析；状态、货币、哈希和时间禁止使用裸字符串或浮点数。金额使用最小货币单位整数，时间使用 ISO-8601 UTC，哈希为 SHA-256 hex。
- API key、签名 URL、个人资料和授权原件不得写入 Git、日志、异常消息或原始 provider request snapshot。
- 所有媒体保持私有；使用短时签名 URL。导出、发布与人工审核必须保留不可静默覆盖的记录。

## 工作规则

- 每个任务必须交付可执行验证：至少包含对应的 typecheck、测试或端到端演示命令及结果。
- 修改文件时使用当前平台稳定的、可审计的编辑方式；不覆盖或回退用户已有内容。
- 不提前实现多租户、支付、自动模型路由、自动审核放行、工作流编辑器、LoRA 训练、复杂剪辑器或推荐系统。
- 所有对外发布候选必须由人工完成内容、版权、AI 标识三项审核；自动评估只能建议或拦截，不能放行。
