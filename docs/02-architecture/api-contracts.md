# TaskFlow API 与服务端契约

> 状态：生效
> 维护阶段：MVP
> 关联文档：[架构说明](architecture.md)、[技术决策 ADR](adr-001-technical-decisions.md)

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.2 |
| 最后更新 | 2026-09-12 |
| 文档状态 | 生效（与当前实现同步） |

## 1. 通用约定

- 所有受保护入口先读取 Session，再执行 Workspace 授权。
- 外部输入先经过 Zod Schema 校验。
- Server Action 返回可序列化的 `ActionResult<T>`。
- Route Handler 使用 HTTP 状态码和统一错误体。
- 错误消息不得泄露密钥、密码、Session Token、SQL 或堆栈。

## 2. Server Action 返回类型

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        fields?: Record<string, string>;
      };
    };
```

## 3. 认证限流契约

登录与注册都受滑动窗口限流（窗口固定 1 分钟，超限返回 `RATE_LIMITED`，文案含剩余等待秒数）。**计数的唯一位置是 Auth.js 的 `authorize()`**（`lib/auth-rate-limit.ts`）——凭据回调 `/api/auth/callback/credentials` 是一条可以绕开登录表单 Server Action 的公开入口，只在其上层限流等于给暴力破解留不限速的路；登录表单 Action 里只保留只读前置检查，用于提前给出友好提示。

| 桶 | key 形式 | 额度（env） | 计数策略 |
|---|---|---|---|
| 登录-邮箱 | `auth:login:email:<email>:<ip>` | `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE`（默认 10） | **只统计失败**：失败后补记，登录成功即清零 |
| 登录-IP | `auth:login:ip:<ip>` | `AUTH_IP_RATE_LIMIT_PER_MINUTE`（默认 30） | 每次尝试都计数（保护 bcrypt 成本） |
| 注册-IP | `auth:register:ip:<ip>` | `AUTH_REGISTER_RATE_LIMIT_PER_MINUTE`（默认 5） | 每次尝试都计数、成功不退还（bcrypt 落在成功路径上） |

> `<ip>` 在 IP 维度不可信时为固定值 `local`（见下文第 2 条），此时登录-IP 桶与注册-IP 桶不参与限流。

几个刻意的设计决定：

1. **登录邮箱桶按「邮箱 + IP」组合分桶，而不是只按邮箱。** 若只按邮箱，攻击者用自己的一个 IP 打满 10 次失败，就能把真实用户挡在门外（拦截发生在验证之前，正确密码也过不去），等于提供免费的锁号手段。组合桶下攻击者只能烧掉自己那份额度，真实用户从自己的 IP 登录完全不受影响。**该保证以可信的 IP 维度为前提**：IP 不可信时桶退化为按邮箱计数，针对特定邮箱的持续失败仍可形成锁号——行为与解除条件见 `p0-delivery-plan.md` §9。
2. **IP 维度不可信时整体跳过，而不是退化成全局桶。** `lib/client-ip.ts` 在「生产环境且未设置 `TRUST_PROXY=true`」时返回 `null`，此时登录-IP 桶与注册-IP 桶不参与限流，登录退守「按邮箱（+固定后缀）的失败计数」。所有客户端共享一个 `unknown` 桶等于送给攻击者一个全站锁死开关（打满 30 次/分钟就能挡住所有人的登录），宁可少一道防线也不制造这个开关。
3. **注册无法按邮箱分桶**（邮箱由攻击者任意构造），且 bcrypt 成本落在「成功注册」路径上，所以注册桶按 IP 计数且不退还。IP 维度不可信时注册限流整体跳过——这意味着未配置可信代理的生产环境没有注册频次防护，必须在 Nginx 层用 `limit_req` 补齐。
4. **用户不存在与密码错误执行同样的 bcrypt 比对**（对固定 dummy 哈希），响应耗时一致，无法通过计时枚举注册邮箱。

### IP 来源的可信前提

`x-forwarded-for` / `x-real-ip` **可伪造**，只有在反向代理**覆写**时才可信。生产 Nginx 必须配置：

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

并且应用环境变量设置 `TRUST_PROXY="true"`，否则应用会主动放弃 IP 维度（见上文第 2 条）。本地直连（docker 端口映射、无代理、非生产模式）取不到这两个头时归入 `unknown` 桶。

> 实现为单实例内存滑动窗口，多副本部署时各副本独立计数（见 `p0-delivery-plan.md` §9）。
> 冒烟脚本含「REST 回调无法绕开邮箱失败计数」的回归断言；依赖 IP 维度的用例在未信任代理的目标上自动跳过。

## 4. AI 拆分接口

### 请求

```http
POST /api/ai/breakdown
Content-Type: application/json
```

```json
{ "prompt": "将登录功能拆分为可执行的开发任务" }
```

约束：`prompt` 去除首尾空白后长度为 10-4000 个字符。

### 成功响应

```json
{
  "ok": true,
  "data": {
    "subtasks": [{ "title": "设计登录表单", "description": "..." }],
    "usage": {
      "promptTokens": 128,
      "completionTokens": 96,
      "totalTokens": 224,
      "estimated": false
    }
  }
}
```

`usage` 为 Token 统计：真实调用取自模型响应；`AI_PROVIDER=mock` 时为估算值并以 `estimated: true` 标记。

### 错误响应

```json
{
  "ok": false,
  "error": {
    "code": "AI_TIMEOUT",
    "message": "AI 响应超时，请重试"
  }
}
```

| 状态码 | 错误码 | 场景 |
|---:|---|---|
| 400 | `VALIDATION_FAILED` | 输入为空、过短（<10）或过长（>4000）、请求体不是 JSON |
| 401 | `UNAUTHORIZED` | 没有有效 Session |
| 429 | `RATE_LIMITED` | 超过每分钟额度（`AI_RATE_LIMIT_PER_MINUTE`，默认 10），文案含剩余等待秒数 |
| 502 | `AI_INVALID_OUTPUT` | 模型输出无法通过 Schema（**零写入**） |
| 503 | `AI_DISABLED` | `AI_PROVIDER=openai` 但 `AI_BASE_URL`、`AI_API_KEY` 或 `AI_MODEL` 任一未配置 |
| 504 | `AI_TIMEOUT` | 上游超过 `AI_TIMEOUT_MS` |
| 500 | `INTERNAL` | 未分类服务端错误 |

限流按 `userId` 分桶，仅对**真正发起上游调用**的请求计数——参数校验失败不占额度。
当前实现为单实例内存滑动窗口，多副本部署时计数不共享（见 `p0-delivery-plan.md` §9）。

## 5. Issue 变更契约

Issue 创建、编辑、删除和移动统一走 `actions/issue.ts` 的 Server Action，不暴露独立 REST API。客户端不得传入可信的 `userId`；`workspaceId` 必须由服务端 Session 和 Workspace 上下文推导或校验。

## 6. 批量创建契约

AI 结果必须先由用户确认，服务端再执行 `createIssuesFromSubtasks`。批量写入使用 Prisma `$transaction`，全成功或全失败。

### 入参

```ts
{
  requestId: string;   // 幂等键，8-64 位，仅 [A-Za-z0-9_-]（禁止冒号：会被拼进主键作前缀）
  subtasks: Array<{ title: string; description?: string | null }>;  // 1-10 条
}
```

### 返回

```ts
ActionResult<{ createdCount: number; duplicate: boolean }>
```

### 幂等语义

服务端用 `requestId` 推导确定性主键 `<workspaceId>:<requestId>:<index>`，因此：

| 情形 | 行为 |
|---|---|
| 同一批次重复提交 | 主键已存在 → 直接返回既有结果（`duplicate: true`），不产生重复任务 |
| 并发重复提交 | 落败方撞唯一约束（P2002）→ 读回本批次结果返回，不报 500 |
| 事务中途失败 | 整批回滚（含已建记录），重试仍按同一批主键创建，不留半成品 |
| 客户端换了 `requestId` | 视为新批次，会再次创建（这是预期行为，不是缺陷） |

主键**必须带上 `workspaceId` 前缀**：若只由客户端 `requestId` 决定，「同一 ID 在别的 Workspace 已存在 → CONFLICT」与「不存在 → 创建成功」就成了可区分的响应通道，等于允许通过错误码探测他人数据是否存在（违反 `lib/issues.ts` 写下的铁律）。带上 workspaceId 后跨 Workspace 冲突在结构上不可能发生。

实现位于 `lib/issue-batch.ts`（独立于 `lib/ai.ts`，后者只产出与校验）。新任务的 `position` 接在 BACKLOG 列已有最大值之后（步长 100），不与既有数据撞号。实现刻意不新增批次表：ADR 与 `data-model.md` 已冻结六表模型，确定性主键让唯一性由数据库主键天然保证，且批次成员可由主键前缀还原（`<workspaceId>:<requestId>:`）。

### 条数约束的两处下限（刻意不同）

| 场景 | 下限 | 理由 |
|---|---|---|
| AI 拆分输出（`/api/ai/breakdown`） | 3-10 条 | Prompt 要求 3-10；条数不合规视为上游输出不可用 → `502 AI_INVALID_OUTPUT`，零写入 |
| 用户确认创建（`createIssuesFromSubtasks`） | **1**-10 条 | 验收要求「结果可查看/编辑/删除单条」，用户有权只保留自己认可的子任务 |

两者若共用同一个下限，用户把候选删到 2 条后点确认就会收到一个无法自救的报错（面板没有新增候选的能力）。

> **验证状态**：AI 输出侧的条数与无效输出断言已由冒烟覆盖（含 `TOOFEW` mock 分支）；「确认创建」按钮的点击链路与 1 条下限需 Playwright 或手动验证。

## 7. 文档变更契约（ADR-007 第一阶段）

文档的新建、保存、删除与版本恢复统一走 `actions/document.ts` 的 Server Action，不暴露独立 REST API；读取由路由层的 Server Component 直接经 `lib/documents.ts` 完成（通道 A / B 的划分见 `architecture.md` §7.1）。

### 7.1 工作区来源（唯一关键约束）

| 操作 | 工作区来源 | 说明 |
|---|---|---|
| 新建 | 服务端推导（`ensureWorkspaceForUser`） | 文档尚不存在，客户端传入的 `workspaceId` 一律被忽略；契约里也已不再要求该字段 |
| 保存 / 删除 / 恢复 | `assertDocumentAccess` 返回的 `workspaceId` | 即**文档实际所属**的工作区。授权判定与写入范围必须同源，否则用户同时属于多个工作区时会变成「按 A 授权、往 B 写」 |

`assertDocumentAccess` 同时承担授权：`read` 只要求是工作区成员；`edit` / `restore` 要求 `OWNER` 或 `EDITOR`。

### 7.2 乐观并发控制

保存必须携带客户端持有的 `baseVersion`（即上一次成功保存后的 `contentVersion`）：

| 情形 | 行为 |
|---|---|
| `baseVersion` 与库内 `contentVersion` 一致 | 条件更新命中，`contentVersion` +1，并写入一条同版本号的 `DocumentVersion` |
| 不一致（别处已保存） | 条件更新命中 0 行 → `CONFLICT`，**不写版本记录、不覆盖他人内容** |

返回 `ActionResult<{ contentVersion: number }>`，客户端据此更新下一次提交的 `baseVersion`。

### 7.3 字段语义：缺省与显式清空

`summary` 区分两种情况——表单**未提交**该字段时保持原值，提交空白串时才清空。规则实现于 `lib/documents.ts` 的条件写入与 `lib/validation.ts` 的 `documentSummarySchema`，并由单元测试固定。若不加区分，编辑器（当前不渲染摘要）保存一次就会把摘要静默清空。

### 7.4 删除语义

删除是**软删除**：置 `deletedAt` 并归档（`status = ARCHIVED`），行与版本历史保留。详情页随后因 `deletedAt: null` 过滤而返回 404，因此删除后列表页与详情页两个路径都要失效。

### 7.5 请求体上限

正文上限 20 万字符（`lib/validation.ts`）与 Server Action 默认 1MB 请求体上限不对齐：20 万个 4 字节字符约 800KB，无 JS 时的原生表单提交（`application/x-www-form-urlencoded`，中文被百分号编码为 9 字节/字）可达约 1.8MB，会在到达 Action 前就被框架拒绝，导致友好的长度校验提示永远不会触发。因此 `next.config.ts` 显式设置 `experimental.serverActions.bodySizeLimit = "3mb"`。
