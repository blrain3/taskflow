# TaskFlow 系统架构设计文档

> 状态：生效
> 维护阶段：MVP / 部署
> 关联文档：[文档中心](../README.md)、[技术决策 ADR](adr-001-technical-decisions.md)

> 配套图示：[architecture-diagram.html](architecture-diagram.html)（分层架构、模块依赖、数据流、部署拓扑）
> 关联文档：`adr-001-technical-decisions.md`、`../01-product/mvp-scope.md`、`../01-product/user-stories.md`、`../03-development/development-roadmap.md`

> 图示阅读约定：图中能力按“已实现 / 部分实现 / 规划中 / 未验证”理解；视觉连线表达目标依赖关系，不等同于当前已部署或已通过自动化验证。

| 项目 | 内容 |
|---|---|
| 产品名称 | TaskFlow（仓库包名 `helio-app`） |
| 文档版本 | v1.3 |
| 最后更新 | 2026-09-12 |
| 文档状态 | 生效架构 + 实现状态同步 |
| 读者 | 开发者本人、Code Review、面试评审 |

---

## 1. 现状与目标：为什么要区分 as-is 与 to-be

架构文档最容易失效的方式，是把「打算这么写」记录成「已经这么写了」。因此本文显式区分两个状态：

| 维度 | 现状（as-is） | 目标（to-be） |
|---|---|---|
| 代码 | 已完成认证、Workspace、Issue CRUD、列表、看板与 AI 闭环（含限流、Token 统计、批量创建幂等）；架构评审整改第一批已落地（批量创建独立模块、幂等主键加工作区前缀、proxy 路由保护、根级错误边界与安全响应头、查询硬上限） | 分页化列表、领域层测试补齐、剩余 P1/P2 问题消化 |
| 提交 | 提交历史按任务逐步整理，遵循 `commit-rules.md` 中文规范 | 持续按任务拆分提交 |
| 数据 | Prisma 六表模型、迁移和 PostgreSQL 容器已落地；看板整列重写已优化为单条 SQL | 补齐生产迁移、备份恢复演练 |
| 认证 | Auth.js Credentials + JWT 已落地；限流在 authorize() 统一计数（覆盖 Server Action 与 REST 回调两条路径）、不可信 IP 维度自动跳过、注册并发冲突映射与计时均衡已补齐 | 补充登录风控和生产审计能力 |
| AI | AI 拆解、限流、超时重试、Token 统计与服务端幂等已落地并通过冒烟；批量落库独立于 AI 模块（`lib/issue-batch.ts`） | AI 面板结构化输出改用 `generateObject` |
| 测试 | Jest 已接入（11 套件 32 用例）、Playwright 已接入（基础用例）、冒烟 40 项 | 扩充 E2E 覆盖拖拽与 AI 确认链路；接入 RTL |
| 文档 | `docs/` 已完整定义范围、ADR、Story、DoD，并与实现状态同步 | 持续保持同步 |
| 所处阶段 | 第 0-4 梯队已完成，第 5 梯队（部署）进行中 | 阶段 7 完成后的可演示 MVP |

**结论**：本仓库当前处于 MVP 实现中期。第 4 章之后描述目标架构，已完成部分以第 14 章执行状态和 P0 交付计划为准；实现偏离目标架构时，应记录原因并更新 ADR 或技术债。

---

## 2. 系统定位与范围

### 2.1 一句话定位

TaskFlow 是一个单人可完成的、Linear 风格的轻量任务协作平台，差异化能力是**用自然语言驱动 AI 拆解任务**。

### 2.2 核心业务闭环

```
登录 → 进入 Workspace → 创建 Issue → 列表查看 → 看板拖拽改状态 → AI 拆分子任务 → 用户确认后批量创建
```

这条闭环是架构的脊柱：**所有分层、模块与数据流设计，都是为了支撑这一条链路可持久、可校验、可回滚。**

### 2.3 架构边界（不做什么）

| 类别 | 明确排除 |
|---|---|
| 业务 | Project 层级、团队成员邀请、复杂 RBAC、评论/附件/通知、实时协作 |
| AI | AI 周报、AI 优先级推荐、多模型路由、独立 FastAPI 服务 |
| 技术 | 不迁移到 `src/`；MVP 不引入 Zustand；不引入 GraphQL；不做移动端原生应用 |

边界来源：`mvp-scope.md` 第 3.3 节、`adr-001` 第 10 节。

---

## 3. 技术栈与关键决策

详细接口、数据、测试、运维和安全约束分别见 [API 契约](api-contracts.md)、[数据模型](data-model.md)、[测试策略](testing-strategy.md)、[运维手册](operations-runbook.md) 和 [安全威胁模型](security-threat-model.md)。

| 层 | 选型 | 决策依据 |
|---|---|---|
| Web 框架 | Next.js 16.x App Router（根目录 `app/`） | ADR-001 §7，不做无收益的 `src/` 迁移 |
| UI 运行时 | React 19.x（RSC + Client Component） | Server-first 减少客户端 JS |
| 语言 | TypeScript `strict: true` | `tsconfig.json` 已启用 |
| 样式 | Tailwind CSS v4（三层语义令牌，`[data-theme]` 驱动） | 已在 `app/globals.css` 落地；组件层选型 shadcn/ui（ADR-006），迁移进行中 |
| 认证 | Auth.js Credentials Provider | 不依赖国内访问不稳定的第三方 OAuth |
| 数据库 | PostgreSQL（本地 Docker / 线上腾讯云） | 拒绝 SQLite，避免开发与生产行为差异 |
| ORM | Prisma | Schema 即数据模型文档 |
| AI | Vercel AI SDK + OpenAI-compatible（默认 DeepSeek） | Key 常驻服务端，可切换通义千问 |
| 状态管理 | Server-first：Server Components + Server Actions + URL Params + React 本地状态 | MVP 不引入 Zustand |
| 拖拽 | `@dnd-kit` | 无障碍与键盘操作支持更好 |
| 测试 | Jest（11 套件 32 用例）+ Playwright（基础用例）+ 冒烟 40 项；RTL 为待接入目标 | E2E 覆盖拖拽与 AI 确认链路后纳入 CI 门禁 |
| CI/CD | GitHub Actions（lint → format → prisma validate → build → test） | E2E 用例稳定后增加 test:e2e/deploy |
| 部署 | 腾讯云 Lighthouse/ECS + `docker-compose.prod.yml` + Nginx + HTTPS | 生产数据库为外部腾讯云 PostgreSQL；Vercel 仅作可选国际预览 |

### 3.1 环境变量契约

所有外部依赖通过环境变量注入，`.env` 只存在于本地与服务器，**禁止进入 Git**（仓库仅提交 `.env.example`）。

| 变量 | 用途 | 是否可暴露到客户端 |
|---|---|---|
| `DATABASE_URL` | Prisma 连接串 | 否 |
| `AUTH_SECRET` | Session 签名 | 否 |
| `AUTH_TRUST_HOST` | 自托管下必须为 `true`，否则 Auth.js 拒绝非 localhost 的 Host | 否 |
| `TRUST_PROXY` | 是否信任反向代理覆写的转发头；生产未设 `true` 时应用**跳过按 IP 的限流**（见 `api-contracts.md` §3） | 否 |
| `AI_PROVIDER` | `openai`（默认，调真实模型）或 `mock`（离线开发与冒烟） | 否 |
| `AI_BASE_URL` | OpenAI-compatible 端点 | 否 |
| `AI_API_KEY` | DeepSeek Key | **严禁** |
| `AI_MODEL` | 模型名 | 否 |
| `AI_TIMEOUT_MS` | AI 调用超时 | 否 |
| `AI_RATE_LIMIT_PER_MINUTE` | 每用户每分钟 AI 调用额度（默认 10） | 否 |
| `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE` | 登录邮箱桶：每分钟失败次数上限（默认 10） | 否 |
| `AUTH_IP_RATE_LIMIT_PER_MINUTE` | 登录 IP 桶：每分钟尝试次数上限（默认 30） | 否 |
| `AUTH_REGISTER_RATE_LIMIT_PER_MINUTE` | 注册 IP 桶：每分钟尝试次数上限（默认 5） | 否 |

> 规则：任何以 `AI_` 开头或含 `SECRET`/`KEY` 的变量，只能被 `lib/` 下的服务端模块读取，不得出现在 Client Component 或 `NEXT_PUBLIC_*` 中。完整清单与取值说明以仓库根目录 `.env.example` 为准。

---

## 4. 架构总览：六层（L0-L5）+ 横切

```
┌──────────────────────────────────────────────────────────────────────┐
│  L0  客户端（浏览器）                                                  │
│      RSC Payload / HTML、Client Component 交互、乐观更新本地状态        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP（表单提交 / fetch / RSC 导航）
┌───────────────────────────────▼──────────────────────────────────────┐
│  L1  表现层  app/（Next.js App Router）                               │
│      route groups：(auth) / (dashboard)；RSC 负责数据读取              │
│      路由保护、加载态 loading.tsx、错误态 error.tsx、空状态             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ props / 事件回调
┌───────────────────────────────▼──────────────────────────────────────┐
│  L2  组件层  components/                                             │
│      ui/（原子） · layout/（框架） · issue/（业务） · board/（看板+拖拽）│
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 调用 Server Action / fetch Route Handler
┌───────────────────────────────▼──────────────────────────────────────┐
│  L3  应用服务层  actions/ + app/api/                                  │
│      Server Action：变更入口（校验→鉴权→调用领域→revalidate）           │
│      Route Handler：AI 调用、流式与需要细粒度 HTTP 控制的场景           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 领域函数调用（唯一方向）
┌───────────────────────────────▼──────────────────────────────────────┐
│  L4  领域与数据访问层  lib/                                            │
│      prisma.ts · auth.ts · ai.ts · validation.ts · errors.ts          │
│      业务规则、权限判定、Schema 校验、外部服务封装                        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Prisma Client
┌───────────────────────────────▼──────────────────────────────────────┐
│  L5  数据层  PostgreSQL                                               │
│      User · Account · Session · Workspace · WorkspaceMember · Issue   │
└──────────────────────────────────────────────────────────────────────┘

横切关注点（贯穿所有层）：
  认证与授权 · 输入校验 · 错误模型 · 日志与可观测 · 类型定义 types/
  测试 tests/ · 容器化与 CI · 环境变量管理
```

**依赖方向规则**：页面层 `app/` 可组合 `components/` 并在服务端直接读取 `lib/` 查询函数；交互组件和 hooks 通过 `actions/` 发起变更；`actions/` 调用 `lib/`；`lib/` 访问 Prisma 或外部服务。禁止 `lib/` 依赖 UI、组件直接访问 `lib/prisma`、Action 依赖组件。详细允许关系见第 5.2 节。

---

## 5. 目录结构与各层职责

### 5.1 目标目录结构（ADR-001 §7）

```text
app/
├── (auth)/                     # 未登录可访问：登录、注册
│   ├── layout.tsx
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/                # 需登录：受保护的业务区
│   ├── layout.tsx              # 顶栏，注入 Session 与 Workspace
│   ├── issues/
│   │   ├── page.tsx            # 列表 / 看板，视图由 ?view= 决定
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── documents/              # 文档写作（ADR-007 第一阶段）
│   │   ├── page.tsx            # 文档列表 + 新建表单
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   └── [documentId]/       # 编辑器 + 版本历史
│   │       ├── page.tsx
│   │       └── loading.tsx
│   └── overview/               # 概览仪表盘（P1 规划，尚未创建）
├── api/
│   ├── ai/breakdown/route.ts   # AI 拆解（需要超时/流式的细粒度控制）
│   ├── auth/[...nextauth]/route.ts
│   └── health/route.ts         # 健康检查（200 ok / 503 degraded）
├── error.tsx                   # 根级错误边界（兜住所有路由段的渲染错误）
├── global-error.tsx            # root layout 自身失败的最后防线
├── not-found.tsx               # 全站 404
├── layout.tsx                  # 根布局
└── globals.css                 # Tailwind 入口与三层设计令牌

components/
├── ui/                         # 原子组件（button、input、dialog、badge、skeleton…）
├── layout/                     # 预留；当前页面骨架直接位于 app/(dashboard)/layout.tsx
├── app-nav.tsx                 # 外壳跨页导航（usePathname 高亮 + aria-current）
├── issue/                      # IssueCard、IssueList、IssueForm、IssueRow、AiBreakdownPanel
├── document/                   # DocumentEditor、CreateDocumentForm、VersionHistory、RestoreVersionForm
└── board/                      # Board、BoardColumn、IssueCard（看板+拖拽）

actions/                        # Server Actions：变更入口（"use server"）
├── auth.ts                     # 注册、登录、登出
├── issue.ts                    # Issue CRUD、状态变更、批量创建
└── document.ts                 # 文档新建、保存、软删除、版本恢复

lib/
├── prisma.ts                   # Prisma Client 惰性单例（防热重载泄漏、无 .env 可构建）
├── auth.ts                     # Auth.js 配置、session() 封装、requireUser()
├── auth-rate-limit.ts          # 认证限流共享逻辑（计数在 authorize，覆盖 REST 回调）
├── ai.ts                       # 模型调用、重试、限流、Token 统计（只产出不写库）
├── ai-parser.ts                # AI 输出抽取与 Schema 校验
├── ai-retry.ts                 # 瞬时故障重试策略
├── issue-batch.ts              # AI 子任务的批量事务创建（幂等、冲突、position 分配）
├── documents.ts                # 文档读写：摘要投影、乐观并发控制、版本历史与恢复
├── document-permissions.ts     # 文档授权：返回文档归属工作区，写库范围与授权同源
├── env.ts                      # 环境变量必需/可选分级、惰性校验
├── issues.ts                   # Issue 领域逻辑（listIssues、moveIssueWithinWorkspace、buildMoveIssueUpdate）
├── validation.ts               # Zod Schema（唯一校验真源，前后端共用）
├── permissions.ts              # Workspace 归属判定与初始化
├── rate-limit.ts               # 内存滑动窗口限流
├── client-ip.ts                # 客户端 IP 解析（不可信时返回 null，调用方跳过 IP 维度）
├── password.ts                 # bcryptjs 哈希
├── db-errors.ts                # Prisma 错误判定（P2002 等）
├── errors.ts                   # 统一错误模型与安全映射
└── utils.ts                    # cn 等 UI 工具

hooks/                          # useBoardMove（乐观更新与回滚）
types/                          # action.ts（ActionResult/ErrorCode）、issue.ts、next-auth.d.ts
tests/
├── unit/                       # Jest：validation、errors、rate-limit、auth-rate-limit、issue-batch 等
└── e2e/                        # Playwright：基础冒烟
scripts/smoke.mjs               # HTTP 冒烟（40 项，环境自适应）
docker/                         # entrypoint.sh（先 migrate deploy 再启动）
prisma/                         # schema.prisma 与迁移
proxy.ts                        # 粗粒度路由保护（未登录访问受保护路径 302 到 /login）
docs/                           # 本文档所在
```

### 5.2 各层职责与约束

| 层 | 目录 | 核心职责 | 硬性约束 |
|---|---|---|---|
| L1 表现层 | `app/` | 路由、数据读取、鉴权重定向、加载/错误/空状态 | 默认为 Server Component；只有需要事件与状态时才加 `"use client"`；不写业务规则 |
| L2 组件层 | `components/` | 渲染与交互，接收 props，回调交给上层 | 不直接访问数据库、不读环境变量密钥；展示逻辑与业务逻辑分离 |
| L3 应用服务层 | `actions/`、`app/api/` | 编排用例：校验 → 鉴权 → 领域调用 → 失效缓存 → 返回统一结果 | 每个 Action 必须自成闭环地完成 Session 与 Workspace 校验；不得信任客户端传来的 `workspaceId` |
| L4 领域与数据访问层 | `lib/` | 业务规则、权限判定、外部服务封装、Schema 校验 | 不感知 React、不感知 HTTP；输出纯数据或抛出领域错误 |
| L5 数据层 | PostgreSQL | 持久化、约束、事务 | 枚举用数据库枚举；Issue 必须外键绑定 Workspace |

---

## 6. 核心模块职责清单

| 模块 | 位置 | 功能职责 | 输入 | 输出 | 依赖 |
|---|---|---|---|---|---|
| Auth 模块 | `lib/auth.ts`、`actions/auth.ts`、`app/(auth)/` | 注册/登录/登出、JWT 会话签发与校验、路由保护 | 邮箱+密码；HttpOnly Cookie | Session 对象；重定向 | Prisma `User`（`Account`/`Session` 为 OAuth 兼容预留，不在 MVP 写入） |
| Workspace 模块 | `lib/permissions.ts`、`app/(dashboard)/layout.tsx` | 首次初始化 Workspace（确定性 ID + upsert + P2002 兜底）、当前 Workspace 解析、归属校验 | `userId` | `Workspace` 或 403 | Auth、Prisma |
| Issue 模块 | `actions/issue.ts`、`components/issue/` | Issue 的创建/编辑/删除/状态变更、列表聚合 | 表单数据、`issueId`、`status` | 变更后的 Issue、统一 Action 结果 | Validation、Permissions、Prisma |
| Board 模块 | `components/board/`、`hooks/` | 四列分列、拖拽、乐观更新与失败回滚 | Issue 列表、拖拽事件（source/target 列） | 本地状态变更 + 服务端同步 | Issue Action、`@dnd-kit` |
| Document 模块 | `lib/documents.ts`、`lib/document-permissions.ts`、`actions/document.ts`、`components/document/`、`app/(dashboard)/documents/` | 文档的新建/保存/软删除、乐观并发控制、版本历史与版本恢复（ADR-007 第一阶段） | 表单数据、`documentId`、`baseVersion`、`version` | 变更后的文档、统一 Action 结果 | Validation、Permissions、Prisma |
| AI 模块 | `lib/ai.ts`、`app/api/ai/breakdown/route.ts` | 自然语言 → 结构化子任务；Prompt、超时、重试、限流、Token 统计 | 自然语言文本（≥10 字符） | `GeneratedSubtask[]`（经 Schema 校验） | 环境变量、Validation、外部 LLM |
| Validation 模块 | `lib/validation.ts` | 定义唯一校验真源（Zod），前后端共用 | 任意待校验输入 | 解析结果或字段级错误 | — |
| Error 模块 | `lib/errors.ts` | 统一错误模型、安全化错误消息、映射为 UI 状态 | 领域错误 / 未知异常 | `ActionResult`（可序列化） | — |
| UI 基础 | `components/ui/`、`app/(dashboard)/layout.tsx` | 原子组件与页面骨架 | props | 视图 | — |

**职责边界示例（避免膨胀）**：`lib/ai.ts` 只负责「得到并校验子任务」，**不写库**；写库由 `lib/issue-batch.ts` 的批量创建负责（`actions/issue.ts` 仅做校验与编排）。这样 AI 失败时天然不会污染数据。

---

## 7. 模块间交互方式

### 7.1 四种交互通道

| 通道 | 使用场景 | 方向 | 是否走网络 | 典型位置 |
|---|---|---|---|---|
| A. RSC 直接读 | 首屏加载 Issue / Document 列表、Workspace 上下文 | 服务端单向 | 否（服务端内部调用） | `app/(dashboard)/issues/page.tsx`、`app/(dashboard)/documents/page.tsx` |
| B. Server Action | 所有写操作（CRUD、拖拽、批量创建、登录） | 客户端 → 服务端 | 是（POST + 表单/RPC） | `actions/*.ts` |
| C. Route Handler | AI 调用（超时、流式、状态码精细控制） | 客户端 → 服务端 | 是（fetch） | `app/api/ai/breakdown/route.ts` |
| D. URL Search Params | 视图切换、筛选、排序（可分享、可回退） | 客户端 → 路由 | 是（导航） | `?view=board&status=TODO` |

### 7.2 契约约定

**Server Action 统一返回类型**（可序列化，禁止直接抛原始错误给客户端）：

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
```

**Action 内部执行顺序（固定四步，缺一不可）**：

```
1) 校验入参   → lib/validation.ts（Zod）
2) 鉴权       → lib/auth.ts 取 Session，未登录直接返回 UNAUTHORIZED
3) 授权       → lib/permissions.ts 校验 workspace 归属，失败返回 FORBIDDEN
4) 执行+失效   → Prisma 写库（必要时 $transaction）→ revalidatePath() 刷新 RSC 缓存
```

**依赖方向规则**：`components/` 通过 `actions/` 发起变更，类型与校验常量可从 `lib/validation` 引入（该文件不依赖运行时，属共享契约；禁止的是数据访问——`lib/prisma` 对组件不可见）；`actions/` 只调用 `lib/`；`lib/` 之间允许同层调用但 `prisma.ts` 为叶子节点。禁止跨层反向调用（如 `lib/` 引入 `components/` 或 `actions/`），以上约束由 `eslint.config.mjs` 强制。

**缓存失效**：写操作成功后必须 `revalidatePath("/issues")`，保证「乐观更新的 UI」与「服务端真实数据」最终一致。

---

## 8. 关键业务数据流转路径

以下四条链路覆盖 MVP 全部 P0 功能。每条都按 **输入 → 处理 → 输出** 展开，并显式列出失败路径。

### 8.1 链路一：认证与 Workspace 上下文建立（US-001 / US-002）

| 步骤 | 位置 | 处理 | 数据形态 |
|---|---|---|---|
| 1 | `app/(dashboard)/layout.tsx` | 读取 Session；无 Session → 重定向 `/login` | Cookie → `Session \| null` |
| 2 | `app/(auth)/login/page.tsx` | 渲染登录表单 | 视图 |
| 3 | `actions/auth.ts` | Zod 校验邮箱/密码 → 查 User → bcrypt 比对哈希 | `{email,password}` → `User` |
| 4 | `lib/auth.ts` | Auth.js 签发 JWT 会话（HttpOnly + 签名 Cookie） | `User` → `sessionToken` |
| 5 | `actions/workspace.ts` | 查询用户 Workspace；不存在则创建或引导创建 | `userId` → `Workspace` |
| 6 | `lib/permissions.ts` | 返回当前 Workspace 并校验归属 | `Workspace` |

- **输入**：用户提交的邮箱 + 密码。
- **输出**：受保护页面的 RSC 渲染结果，且页面内所有查询都以 `workspaceId` 为过滤条件。
- **失败路径**：密码错误 → 返回统一模糊提示（不泄露「用户是否存在」）；未登录访问 Dashboard → 302 到 `/login`；跨 Workspace 访问 → `FORBIDDEN`。
- **安全要点**：密码仅以 bcrypt 哈希落库；会话使用 JWT 策略（Credentials Provider 的硬性约束），因此 Prisma 的 `Session` 表在 MVP 不写入，详见 `adr-001-technical-decisions.md` §4。

### 8.2 链路二：Issue CRUD 与列表视图（US-003 / US-004 / US-005）

```
用户填写表单
   → components/issue/IssueForm（受控输入，标题非空 ≤200）
   → actions/issue.ts  createIssue(formData)
       ├─ Zod 校验（标题长度、状态枚举合法性）
       ├─ session() 取 userId
       ├─ 校验 workspace 归属
       └─ prisma.issue.create({ workspaceId, title, description, status: 'BACKLOG', position: 列内 max + 100 })
   → revalidatePath('/issues')
   → RSC 重新读取列表 → components/issue/IssueList 渲染
```

| 阶段 | 输入 | 输出 |
|---|---|---|
| 表单层 | 用户击键 | `FormData`（含 title/description/status） |
| Action 层 | `FormData` | `ActionResult<Issue>` |
| 数据层 | 领域字段 | `Issue` 行（含 id、workspaceId、timestamps） |
| 视图层 | `Issue[]` | 列表 UI；空数组时渲染空状态 + 创建入口 |

- **失败路径**：标题为空/超长 → 返回字段级错误，UI 阻止提交且不产生虚假成功；数据库异常 → `ActionResult.ok=false`，列表保持原状；删除失败 → Issue 保留在页面上并提供重试。
- **幂等性**：删除使用 `deleteMany({ where: { id, workspaceId } })`，跨 Workspace 的删除天然不会命中，返回 `NOT_FOUND`。

### 8.3 链路三：看板拖拽改状态（乐观更新 + 回滚，US-006）

这是全项目对「异步状态一致性」要求最高的链路，因此单独设计：

```
① 用户拖拽卡片（@dnd-kit 触发 onDragEnd）
② 计算目标列 status，若与当前列相同 → 直接返回（无效拖拽不发起请求）
③ 乐观更新：本地 state 立即把该 Issue 移到目标列（UI 立刻响应）
④ 调用 actions/issue.ts updateIssueStatus(issueId, status)
⑤ 服务端返回 ok:true → revalidatePath('/issues')，用服务端数据收敛本地状态
⑥ 服务端返回 ok:false → 回滚到 ③ 之前的快照 + 显示失败提示
```

| 阶段 | 数据形态 |
|---|---|
| 拖拽事件 | `{ activeId, from, to }` |
| 本地状态 | `Issue[]` 按 status 分组，产生新引用触发重渲染 |
| 服务端请求 | `{ issueId, status }` |
| 服务端真相 | 更新后的 `Issue` 行 |

- **关键约束**：失败时**不得留下虚假 UI 状态**（对应 US-006 验收标准）；使用稳定的 `key={issue.id}` 避免拖拽后错位；`status` 必须落在 `BACKLOG/TODO/IN_PROGRESS/DONE` 枚举内。
- **竞态处理**：当前 MVP 采用串行化策略；存在 `pendingIds` 时禁止新的拖拽，当前请求完成或回滚后才允许继续操作。

### 8.4 链路四：AI 任务拆分 → 确认 → 批量创建（US-007 / US-008）

```
自然语言输入（≥10 字符）
   → components/issue/AiBreakdownPanel
   → POST app/api/ai/breakdown/route.ts
       ├─ session() 鉴权（未登录 401）
       ├─ 频次限制检查
       ├─ lib/ai.ts：构造 Prompt → 调用 DeepSeek（AI_TIMEOUT_MS）
       ├─ Zod 校验输出为 GeneratedSubtask[]
       │      └─ 不合规 → 不落库，返回可理解错误，允许重新生成
       └─ 返回 { subtasks, usage }
   → 结果页：用户可 查看 / 编辑 / 删除 单条子任务
   → 用户点击「Confirm & Create All」（防重复点击）
   → createIssuesFromSubtasksAction（actions/issue.ts：校验 → 鉴权 → 授权）
       └─ lib/issue-batch.ts：$transaction 批量写入 + `requestId` 确定性主键幂等   // 全成功或全失败
   → revalidatePath('/issues') → 回到看板/列表
```

数据形态演进：

| 阶段 | 形态 |
|---|---|
| 输入 | `string`（自然语言） |
| AI 原始输出 | 文本 / JSON（不可信） |
| 校验后 | `GeneratedSubtask[] = { title: string; description?: string }[]` |
| 用户确认后 | 用户删改后的 `GeneratedSubtask[]` |
| 落库后 | `Issue[]`，`status` 默认 `BACKLOG`，`workspaceId` 取自服务端 Session |

- **安全边界**：`AI_API_KEY` 仅在 `lib/ai.ts` 读取，绝不下发浏览器；限流与超时在服务端实施；Token/请求次数在服务端记录。
- **失败路径**：AI 输出不合 Schema → 零写入；请求超时 → 停止加载并提供重试；批量写入失败 → 事务回滚，不产生不可追踪的部分数据；重复点击确认 → 前端 pending 禁用 + 服务端 `requestId` 确定性主键幂等（重复提交返回既有结果，不产生重复数据，详见 `api-contracts.md` §6）。

---

## 9. 数据模型

```
User ──1:N── Account        （Auth.js 账号绑定）
User ──1:N── Session        （会话表，MVP 采用 JWT 策略故不写入，见 adr-001 §4）
User ──M:N── Workspace      （通过 WorkspaceMember 建立成员关系）
Workspace ──1:N── Issue     （Issue 必须属于某个 Workspace）
User ──1:N── Document       （ADR-007 第一阶段；authorId 为 Restrict，保护历史归属）
Workspace ──1:N── Document
Document ──1:N── DocumentVersion
```

| 模型 | 关键字段 | 约束 |
|---|---|---|
| `User` | id、email、name、passwordHash | `email` 唯一；哈希不可为空 |
| `Account` | userId、provider、providerAccountId | 按 provider 组合唯一 |
| `Session` | sessionToken、userId、expires | token 唯一，过期即失效。**MVP 采用 JWT 会话策略，该表不写入**，保留以备接入 OAuth 与「登出所有设备」 |
| `Workspace` | id、name、ownerId | ownerId → User |
| `WorkspaceMember` | workspaceId、userId、role | 复合唯一；权限判定依据 |
| `Issue` | id、workspaceId、title、description、status、createdAt、updatedAt | `workspaceId` 外键必填；`title` 非空 ≤200 |
| `Document` | id、workspaceId、authorId、title、content、format、status、contentVersion、deletedAt | `workspaceId` 外键必填；软删除；`contentVersion` 为乐观并发控制条件 |
| `DocumentVersion` | id、documentId、version、title、content、format、createdById | `(documentId, version)` 唯一；随 Document 级联删除 |

**状态枚举**：Issue 为 `BACKLOG` → `TODO` → `IN_PROGRESS` → `DONE`；Document 为 `DRAFT` / `ARCHIVED`，格式为 `MARKDOWN` / `RICH_TEXT`。使用数据库枚举而非字符串常量，防止非法状态入库。

**索引建议**：`Issue(workspaceId, status)` 支撑看板分列查询；`Document(workspaceId, updatedAt, id)` 支撑文档列表（按更新时间倒序），`DocumentVersion(documentId, version)` 唯一索引支撑版本历史与恢复；`Session(sessionToken)` 支撑每次请求的会话校验。

---

## 10. 安全与权限设计

| 风险 | 对策 |
|---|---|
| 越权访问 | 每个 Action / Route Handler 先鉴权再授权；`workspaceId` 一律由服务端推导，不信任客户端入参；proxy.ts 在框架层拦截未登录访问 |
| 密码泄露 | bcrypt 哈希；错误信息模糊化且用户不存在时以固定 dummy 哈希对齐耗时，无法通过计时或文案枚举邮箱 |
| 密钥泄露 | 密钥只读于服务端 `lib/`；`.env` 不入库不进 Git；仅提交 `.env.example` |
| 注入 | 全部走 Prisma 参数化查询（整列重写用 `Prisma.sql` + `Prisma.join`）；输入统一经 Zod 校验 |
| 滥用 | 认证限流计数统一在 `authorize()`（覆盖表单与 REST 回调两条路径）；不可信 IP 维度自动跳过而非共享全局桶；AI 接口按用户限流、超时与 Token 记录 |
| 重放/重复提交 | 批量创建由 `requestId` 确定性主键幂等兜底，其余写操作靠 pending 禁用；requestId 由客户端生成，重装后可能重复提交（见 `p0-delivery-plan.md` §9） |
| 传播面 | 认证、权限、核心测试、数据库迁移与部署质量**不允许降级**（`development-roadmap.md` §12） |

---

## 11. 错误处理与状态管理约定

- **错误模型**：`lib/errors.ts` 定义 `ErrorCode` 枚举（`UNAUTHORIZED` / `FORBIDDEN` / `VALIDATION_FAILED` / `NOT_FOUND` / `CONFLICT` / `RATE_LIMITED` / `AI_DISABLED` / `AI_INVALID_OUTPUT` / `AI_TIMEOUT` / `INTERNAL`，与 `types/action.ts` 保持一致），对外只暴露安全文案，内部保留细节用于日志。
- **UI 状态机**：每个异步交互必须显式覆盖 `idle / loading / empty / error / success` 五态；加载态不得引起布局跳动（对应 US-005）。
- **状态归属**：
  - 服务端真相 → PostgreSQL；
  - 可分享的视图状态 → URL Search Params；
  - 短生命周期交互状态（拖拽中、表单草稿）→ React 本地状态；
  - 跨页面共享的复杂客户端状态 → 暂不出现，故不引入 Zustand。

---

## 12. 非功能性设计

| 维度 | 设计 |
|---|---|
| 性能 | Server-first 减少客户端 JS；RSC 直连数据库避免多余 API 层；`Issue(workspaceId,status)` 索引；必要处 `memo` + 稳定 `key` |
| 可测试性 | 校验逻辑集中在 `lib/validation.ts`；AI Provider 可 Mock（`AI_PROVIDER=mock`）；Jest 覆盖纯函数层（含整列重写 SQL 构造断言）；Playwright 基础用例已接入 |
| 可观测性 | 结构化日志（变更操作记录 userId / workspaceId / 耗时）；AI 调用记录 Token 与耗时；错误日志不含明文密钥 |
| 可访问性 | 键盘可完整操作、焦点可见、对比度达标、支持 `prefers-reduced-motion` |
| 可维护性 | 单一校验真源、统一返回契约、单向依赖、DoD 强制文档同步 |
| 可部署性 | 环境变量注入；`prisma migrate deploy` 可重复执行；容器重启后数据保持 |

---

## 13. 部署架构

```
用户浏览器
    │ HTTPS (443)
    ▼
Nginx  ── 反向代理 / TLS 终止 / 静态缓存
    │ HTTP (3000, 内网)
    ▼
Next.js 应用容器（Docker Compose 管理）
    │ DATABASE_URL（内网/SSL）
    ▼
PostgreSQL（线上：腾讯云 PostgreSQL；本地：Docker 容器）

旁路（当前已实现）：GitHub Actions → npm ci → Prisma generate/validate → Prettier check → ESLint → build → 单元测试。

目标旁路（E2E 用例与发布凭据接入后）：在上述流程后增加 Playwright E2E 门禁，并由人工批准部署预览环境。
证书：Let's Encrypt / Certbot 自动续期
```

- **环境一致性**：本地与线上均使用 PostgreSQL + Docker Compose，避免「本地能跑线上挂」。
- **发布与回滚**：镜像化发布，回滚即切换上一版本镜像；迁移使用 `prisma migrate deploy`。
- **备份恢复**：定期 `pg_dump`，并至少完整演练一次恢复（见 `development-roadmap.md` 阶段 6 出口条件）。
- **备案提醒**：使用中国大陆地域 + 正式域名需先完成 ICP 备案；学习阶段可先用公网 IP 或中国香港地域验证。

---

## 14. 演进路线与已知边界

| 阶段 | 增量 | 对应 Sprint |
|---|---|---|
| 阶段 1 | 工程基线：结构、Lint、CI、Docker、Prisma 初始化 | Sprint 0 |
| 阶段 2 | 数据模型 + 认证（链路一） | Sprint 1 |
| 阶段 3 | Issue 垂直切片（链路二） | Sprint 1 |
| 阶段 4 | 核心看板 + 拖拽（链路三） | Sprint 2 |
| 阶段 5 | AI 闭环（链路四） | Sprint 3 |
| 阶段 6 | 国内线上部署 | Sprint 4 |
| 阶段 7 | 面试化收尾：架构图、ADR、复盘 | Sprint 4 |

**降级顺序**（进度落后时依次牺牲，`development-roadmap.md` §12）：Vue 对比模块 → 动画/暗黑模式/仪表盘 → 搜索筛选 → Token 展示页 → AI 仅保留任务拆分。**永不降级**：认证、权限、核心测试、数据库迁移、国内部署质量。

**已知技术债与预留**（详细清单与修复批次见 `architecture-review.md`）：

- 评审 P0 中**已修复**：P0-1（批量创建拆至 `lib/issue-batch.ts`）、P0-2（幂等主键加 workspaceId 前缀）、P0-3（新增 `proxy.ts`）、P0-5（整列重写单条 SQL）。P0-4 **部分修复**（`listIssues` 加 500 条硬上限，分页与「加载更多」待做）。
- 评审 P1 中已修复：P1-1（校验常量统一引用）、P1-2（注册 TOCTOU）、P1-7（根级错误边界与安全响应头）。仍待修复：P1-3（四步契约复制粘贴）、P1-4（缓存语义二选一）、P1-6 剩余部分（`lib/issues`/`lib/permissions`/`actions` 主体测试）、P1-8（`role` 裸 String）、P1-9（所有权双重表达）。
- `components/layout/` 目录预留未启用，页面骨架暂由 `app/(dashboard)/layout.tsx` 承担；应用外壳（侧边栏 + 顶栏）按 ADR-006 迁移计划落地。
- Priority / Labels / Assignee 在数据模型上尚未建模（P1）。
- `api/` 目前承载 AI 链路与健康检查，其余写操作统一走 Server Actions。

---

## 附录 A：文档—模块映射

| 文档 | 约束的架构部分 |
|---|---|
| `adr-001-technical-decisions.md` | 第 3 章技术栈、第 5 章目录、第 9 章数据模型 |
| `../01-product/mvp-scope.md` | 第 2 章边界、第 6 章模块范围 |
| `../01-product/user-stories.md` | 第 8 章全部数据流与失败路径 |
| `../03-development/development-language-rules.md` | 第 7 章交互契约、第 11 章状态约定 |
| `../03-development/sprint-plan.md` / `../03-development/development-roadmap.md` | 第 14 章演进路线 |
| `../03-development/definition-of-done.md` | 第 12 章可维护性要求 |

## 附录 B：术语表

| 术语 | 含义 |
|---|---|
| RSC | React Server Component，在服务端渲染、不向客户端发送 JS 的组件 |
| Server Action | 以 `"use server"` 标注的服务端函数，可从客户端直接调用 |
| Route Handler | `app/api/**/route.ts` 中的 HTTP 处理器 |
| 乐观更新 | 先更新本地 UI，再等待服务端确认，失败则回滚 |
| Workspace | 任务数据的隔离单元，所有 Issue 查询的强制过滤维度 |
| 横切关注点 | 贯穿所有层的公共能力，如鉴权、校验、错误、日志 |


