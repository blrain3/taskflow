# TaskFlow 数据模型与迁移契约

> 状态：生效
> 维护阶段：MVP / 部署
> 关联文档：[架构说明](architecture.md)、[API 契约](api-contracts.md)

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.3 |
| 最后更新 | 2026-09-13 |
| 文档状态 | 生效（Schema 为最终事实来源） |

## 1. 模型关系

```text
User 1──N WorkspaceMember N──1 Workspace 1──N Issue
User 1──N Account
User 1──N Document N──1 Workspace
Document 1──N DocumentVersion
```

## 2. 核心模型

字段和关系以 `prisma/schema.prisma` 为最终事实来源；本文解释业务约束和当前实现状态。

| 模型 | 关键字段 | 约束 |
|---|---|---|
| User | `id`, `email`, `passwordHash`, `name` | `email` 唯一；密码只存哈希 |
| Account | Auth.js 兼容字段 | Credentials + JWT MVP 暂不写入 |
| Session | Auth.js 兼容字段 | JWT MVP 不写入数据库 |
| Workspace | `id`, `name`, `createdAt` | 名称非空 |
| WorkspaceMember | `userId`, `workspaceId` | 用户与 Workspace 组合唯一 |
| Issue | `id`, `workspaceId`, `title`, `description`, `status`, `position` | 必须属于 Workspace；状态为数据库枚举 |
| Document | `id`, `workspaceId`, `authorId`, `title`, `content`, `format`, `status`, `contentVersion`, `deletedAt` | 必须属于 Workspace；`authorId` 为 Restrict，保护历史归属；状态与格式为数据库枚举 |
| DocumentVersion | `id`, `documentId`, `version`, `title`, `content`, `format`, `createdById` | `(documentId, version)` 唯一；随 Document 级联删除 |

## 3. Issue 规则

- `title` 非空，最大 200 字符。
- `description` 可为空，最大 2000 字符。
- `status` 只能是 `BACKLOG`、`TODO`、`IN_PROGRESS`、`DONE`。
- `position` 仅用于看板列内排序，默认步长 100；列表视图按 `createdAt desc, id desc` 展示（**不用 `updatedAt`**：看板拖拽会重写整列 `position`，进而刷新这些行的 `updatedAt`，会让列表顺序随拖拽漂移）。
- `position` 在同一 Workspace、状态列内不要求唯一；服务端移动事务会按完整顺序重写，避免并发时依赖唯一值。
- 新任务（手动创建与 AI 批量创建）统一**追加到 BACKLOG 列尾**：`position` 接在本列已有最大值之后（步长 100，`ISSUE_POSITION_STEP`）；并发窗口内的同位次并列由 `createdAt desc` 兜底。
- Issue 暂无父子关系字段；AI 子任务在 MVP 中作为普通 Issue 创建，不建立父 Issue 外键。
- 看板查询索引为 `(workspaceId, status, position)`。
- 所有读取、更新和删除都必须带 `workspaceId` 条件。

## 4. 删除和事务

- Issue 使用硬删除；后续若需要恢复能力，再新增软删除 ADR。
- Document 使用**软删除**（`deletedAt` + `status = ARCHIVED`），行与版本历史保留；所有文档查询都必须带 `deletedAt: null`。
- Workspace 删除策略暂不开放，避免级联删除风险。
- AI 批量创建必须使用 `$transaction`，失败整体回滚。
- AI 批量创建使用服务端幂等：以「`workspaceId` + 客户端 `requestId`」推导确定性主键（详见 [API 契约](api-contracts.md) §6），重复提交命中既有主键直接返回既有结果，不新增批次表；批量创建逻辑位于 `lib/issue-batch.ts`。
- 拖拽移动按目标列完整顺序重写 `position`（单条 SQL 整列重写，见 `p0-5-move-issue-bulk-rewrite.md`），并采用后写者覆盖策略。

## 5. 文档模型与规则（ADR-007 第一阶段）

- `title` 非空，最大 200 字符（与 Issue 标题一致）；`content` 最大 20 万字符；`summary` 可空，最大 2000 字符。
- `format` 当前只产出 `MARKDOWN`；`RICH_TEXT` 是第二阶段预留值，第一阶段不接受写入。
- `status` 只允许 `DRAFT`、`ARCHIVED`。
- `contentVersion` 从 1 起单调递增，**每次成功保存 +1**；它同时是乐观并发控制的条件：保存必须携带客户端持有的 `baseVersion`，条件不满足则返回 `CONFLICT`，不覆盖他人已写入的内容。
- 版本恢复是把历史版本的内容作为一次**新的正向修改**写回（版本号继续 +1），而不是回退指针，因此历史链条不会被覆盖或出现版本号回退。
- 版本历史通过 `document` 关系过滤 `workspaceId`——仅凭 `documentId` 不足以读到他人文档的版本。
- 索引：列表 `(workspaceId, updatedAt, id)`、作者视角 `(authorId, updatedAt)`、按状态筛选 `(workspaceId, status, updatedAt)`。
- 列表查询使用**不含 `content` 的摘要投影**并带查询上限；正文体积远大于任务标题，列表带上正文会同时放大数据库读、服务端内存与 RSC 负载。

## 6. 迁移规则

- 本地开发：`npm run db:migrate`。
- 预览和生产：`npm run db:deploy`，即 `prisma migrate deploy`。
- 不直接修改已应用迁移；变更必须新增迁移。
- 生产迁移前备份数据库。
- Prisma Schema、迁移和本文档必须保持一致。
