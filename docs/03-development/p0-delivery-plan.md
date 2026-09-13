# TaskFlow P0 功能差距分析与交付计划

> 状态：执行中
> 维护阶段：MVP 交付
> 关联文档：[文档中心](../README.md)、[MVP 范围](../01-product/mvp-scope.md)、[Definition of Done](definition-of-done.md)

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.2 |
| 最后更新 | 2026-09-12 |
| 文档状态 | 执行中（第 0-4 梯队已完成，第 5 梯队进行中） |
| 输入依据 | `../01-product/mvp-scope.md`、`../02-architecture/architecture.md`、`../01-product/user-stories.md`、`definition-of-done.md`、`sprint-plan.md`、`development-roadmap.md`、`../02-architecture/adr-001-technical-decisions.md` |
| 读者 | 开发者本人、Code Review |

---

## 1. 文档定位与权威顺序

本文回答两个问题：

1. `mvp-scope.md` 中标记为 **P0** 的功能，当前实现了多少、还差什么；
2. 这些缺口要怎么补、产出什么、达到什么标准才算完成。

出现冲突时，判定优先级遵循 `development-roadmap.md` §1 的规定：

> `MVP 范围 > ADR 技术决策 > User Story 验收标准 > DoD > UI 视觉细节`

### 1.1 必须先处理的文档冲突（重要）

`../archive/develop-plan.md` 是早期草案，其技术选型与已接受的 ADR-001 **存在矛盾**，不得作为实现依据：

| 议题 | `develop-plan.md`（草案，已作废） | `adr-001` / `architecture.md`（权威） |
|---|---|---|
| 目录 | `src/app/` | **保留根目录 `app/`，不迁移 `src/`** |
| 全局状态 | Zustand | **MVP 不引入 Zustand**（Server-first） |
| 数据库 | 开发可用 SQLite | **拒绝 SQLite**，本地也用 Docker PostgreSQL |
| 认证 | NextAuth.js 或 Clerk | **Auth.js Credentials Provider + Prisma** |
| 部署 | Vercel | **腾讯云 + Docker Compose + Nginx + HTTPS**；Vercel 仅可选 |
| 范围 | 含优先级、标签、负责人、搜索、周报 | 这些属 **P1/P2**，MVP 不做 |

**结论**：`develop-plan.md` 建议降级为历史记录或直接归档，后续实现一律以 ADR-001 与 `architecture.md` 为准。

---

## 2. 现状核对（as-is 快照）

| 维度 | 当前状态 | 是否满足 P0 |
|---|---|---|
| 代码结构 | `app/`、`components/`、`actions/`、`lib/`、`hooks/` 等业务分层已建立 | ✅ 基础结构已落地 |
| 目录分层 | `components/`、`actions/`、`lib/`、`types/`、`hooks/` 已建立；测试目录仍在补充 | ⚠️ 测试覆盖不完整 |
| 数据层 | Prisma Schema、迁移和 PostgreSQL Docker 配置已落地 | ✅ 已落地 |
| 认证 | Auth.js Credentials + JWT、登录/登出和 Dashboard 路由保护已落地 | ✅ 已落地 |
| AI | `lib/ai.ts`、`/api/ai/breakdown`、服务端环境变量契约和结果面板已有基础实现 | ⚠️ 待限流、Token 统计和自动化验证 |
| 工程化 | `.env.example`、Dockerfile、Compose、Prettier 和 GitHub Actions 已配置 | ⚠️ 生产发布流程待验证 |
| 测试 | Jest 已接入（11 套件 31 用例）；Playwright 已接入（基础用例）；冒烟 40 项 | ✅ 工具链已接入，覆盖待扩充 |
| 提交历史 | 已按任务逐步整理为中文规范提交（工程基线 → 各梯队 → 加固与修复） | — |
| 文档 | `docs/` 已按产品、架构、开发、面试和设计资产分组，架构契约文档持续补充 | ✅ 持续维护 |
| 已有可用能力 | `npm run dev` / `build` / `lint` 可运行；Tailwind v4 已在 `globals.css` 落地；TypeScript strict 已启用 | 部分可用 |

### 2.1 一句话结论

**15 项 P0 功能中，第 0-4 梯队已完成（含 AI 限流、Token 统计与服务端幂等），第 5 梯队（预览部署与国内部署）进行中。** 架构评审的 P0 问题已在 8.5.2 批次消化（P0-4 为过渡方案，分页待做）；当前优先任务是完成腾讯云生产部署、扩充 E2E 覆盖，并逐批消化评审 P1/P2 遗留（见 `../02-architecture/architecture-review.md` 顶部状态横幅）。

---

## 3. P0 功能清单：名称与用途

下表逐条对应 `mvp-scope.md` §3 P0 表格的 15 项，补充其用途、承载模块与关联 Story。

| 编号 | 名称 | 用途 | 承载模块（`architecture.md`） | 关联 Story |
|---|---|---|---|---|
| P0-01 | 用户登录 | 用固定认证方案完成登录、Session 管理、登出；是所有数据访问的身份前提 | `lib/auth.ts`、`actions/auth.ts`、`app/(auth)/login/` | US-001 |
| P0-02 | Workspace | 提供任务数据的隔离单元；用户首次进入时创建或引导创建，并解析「当前 Workspace」 | `actions/workspace.ts`、`lib/permissions.ts` | US-002 |
| P0-03 | Issue 创建 | 标题必填、描述可选，创建后落库并归属当前 Workspace | `actions/issue.ts`、`components/issue/IssueForm` | US-003 |
| P0-04 | Issue 编辑 | 修改标题、描述、状态并持久化 | `actions/issue.ts`、`components/issue/` | US-004 |
| P0-05 | Issue 删除 | 删除任务，并正确处理删除失败（保留卡片 + 可重试） | `actions/issue.ts`、`components/issue/DeleteIssueDialog` | US-004 |
| P0-06 | 状态管理 | 固定四态 `BACKLOG → TODO → IN_PROGRESS → DONE`，用数据库枚举防止非法值入库 | Prisma Schema + `lib/validation.ts` | US-003/004/006 |
| P0-07 | 列表视图 | 以列表展示当前 Workspace 全部任务，支持空状态、加载态、不跳动 | `app/(dashboard)/issues/page.tsx`、`components/issue/IssueList` | US-005 |
| P0-08 | 看板视图 | 按状态分四列展示任务 | `components/board/Board`、`BoardColumn` | US-006 |
| P0-09 | 拖拽改状态 | 拖拽卡片跨列即更新状态并持久化；失败回滚，不留下虚假 UI | `components/board/`、`hooks/`、`actions/issue.ts` | US-006 |
| P0-10 | AI 拆分任务 | 自然语言（≥10 字符）→ 服务端调用 LLM → Schema 校验后的结构化子任务 | `lib/ai.ts`、`app/api/ai/breakdown/route.ts` | US-007 |
| P0-11 | AI 确认创建 | 用户查看/编辑/删除子任务后，确认才批量落库（事务，全成功或全失败） | `actions/issue.ts` `createIssuesFromSubtasks` | US-008 |
| P0-12 | 加载和错误状态 | 每个异步交互覆盖 `idle/loading/empty/error/success` 五态 | `lib/errors.ts` + `error.tsx`/`loading.tsx` + 各组件 | 横切，US-005 等 |
| P0-13 | 基础权限校验 | 每个服务端入口先鉴权再授权；用户只能访问自己的 Workspace 数据 | `lib/auth.ts` `requireUser()`、`lib/permissions.ts` | 横切，US-002/004 |
| P0-14 | 预览部署 | 通过可访问链接完整演示 MVP，每个 Sprint 结束都要部署一次 | `Dockerfile`、`docker-compose.yml`、CI | 横切 |
| P0-15 | 国内部署 | 腾讯云 + HTTPS 可访问，应用与数据库配置可复现，迁移/备份可演练 | Docker Compose 生产配置、Nginx、Certbot、腾讯云 PostgreSQL | 横切 |

---

## 4. 关联关系与依赖

### 4.1 依赖图

```
【工程基线 · 前置】
  .env.example / Dockerfile / docker-compose.yml / 目录分层 / CI / Prisma 初始化
        │  （无此层，下面全部无法启动）
        ▼
  P0-01 用户登录 ──▶ P0-02 Workspace ──▶ P0-13 基础权限校验
        │                    │
        │                    ▼
        │            P0-06 状态管理（枚举定义）
        │                    │
        │                    ▼
        │            P0-03 创建 / P0-04 编辑 / P0-05 删除  （Issue CRUD）
        │                    │
        │                    ▼
        │            P0-07 列表视图
        │                    │
        │                    ▼
        │            P0-08 看板视图 ──▶ P0-09 拖拽改状态
        │
        └────────────┐
                     ▼
        P0-10 AI 拆分任务 ──▶ P0-11 AI 确认创建（批量事务落库）
                             ▲
                             └── 复用 P0-03 的创建能力 + P0-13 的权限校验

【横切，贯穿全部】
  P0-12 加载和错误状态
  P0-13 基础权限校验
  P0-14 预览部署 ──▶ P0-15 国内部署（同一套 Docker Compose，prod 叠加 Nginx/TLS）
```

### 4.2 关系说明

| 关系 | 说明 |
|---|---|
| 基线 → 全部 | 目录分层、`.env.example`、Prisma 初始化是硬前置。没有数据库和分层，任何 P0 代码都无处安放 |
| 登录 → 一切业务 | P0-13 依赖 Session；没有 P0-01，P0-02 之后全部无法鉴权 |
| Workspace → Issue | `Issue.workspaceId` 外键必填，Workspace 不存在则 Issue 无法创建 |
| 权限校验 横切 | 不是独立功能，而是每个 Action/Route 的固定第 2、3 步（`architecture.md` §7.2） |
| CRUD → 列表 → 看板 → 拖拽 | 严格串行：列表读的是 CRUD 写的数据，看板是列表的分组视图，拖拽是看板上的写操作 |
| AI 两条 | P0-10 只「产出并校验」，不写库；P0-11 才写库。这个切分让 AI 失败天然不污染数据（`architecture.md` §6） |
| 预览 → 国内 | 同一份 Compose，本地一键跑通是线上部署的验收前置；线上只是叠加 Nginx/TLS/云数据库 |
| 加载与错误 横切 | 属于 DoD 必选项（空/加载/错误三态），每个 Story 都要覆盖，不能留到最后补 |

### 4.3 优先级排序

排序原则：**先解锁，再做闭环，最后做差异化**。同时对齐 `sprint-plan.md` 的 Sprint 划分。

| 梯队 | P0 项 | 理由 | 对应阶段 / Sprint |
|---|---|---|---|
| **第 0 梯队（前置）** | 工程基线：目录分层、`.env.example`、`Dockerfile` + `docker-compose.yml`（应用 + PostgreSQL，`docker compose up -d` 一键跑通）、Prisma 初始化、CI | 不做这层，后面所有验收都无法执行 | 阶段 1 / Sprint 0 |
| **第 1 梯队（解锁）** | P0-01 登录、P0-02 Workspace、P0-13 权限校验 | 业务数据的入口与隔离边界，一切 CRUD 的依赖 | 阶段 2 / Sprint 1 |
| **第 2 梯队（首个业务闭环）** | P0-03/04/05 CRUD、P0-06 状态管理、P0-07 列表视图、P0-12 加载与错误 | 形成「登录 → 建任务 → 看到任务」的第一条端到端可演示链路 | 阶段 3 / Sprint 1 |
| **第 3 梯队（交互强化）** | P0-08 看板、P0-09 拖拽改状态 | 对异步一致性要求最高，需在 CRUD 稳定后做 | 阶段 4 / Sprint 2 |
| **第 4 梯队（差异化）** | P0-10 AI 拆分、P0-11 确认批量创建 | 依赖 Issue 创建能力与权限校验；也是项目最大亮点 | 阶段 5 / Sprint 3 |
| **第 5 梯队（交付）** | P0-14 预览部署、P0-15 国内部署 | 预览从 Sprint 0 起持续做；国内部署在功能稳定后一次成型 | 阶段 6-7 / Sprint 4 |

> **不可降级项**（`sprint-plan.md` §3）：认证、权限、核心测试、Docker 化、数据库迁移、国内部署质量。进度落后时按「Vue 对比 → 动画/暗黑/仪表盘 → 搜索筛选 → Token 展示页 → 多余 AI 能力」的顺序降级，上述项不允许牺牲。

---

## 5. 逐项交付物与验收标准

每条 P0 的验收 = `user-stories.md` 的 Given-When-Then + `definition-of-done.md` 的通用门槛。

### 5.1 第 0 梯队：工程基线（非 P0 功能，但为全部 P0 的硬前置）

| 项 | 关键产出物 | 验收标准 |
|---|---|---|
| 目录分层 | `components/{ui,layout,issue,board}/`、`actions/`、`lib/`、`hooks/`、`types/`、`tests/` | 依赖方向可自检：`lib/` 不 import `components/`；`components/` 不直接 import `lib/prisma` |
| 环境变量契约 | `.env.example`（`DATABASE_URL`/`AUTH_SECRET`/`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`/`AI_TIMEOUT_MS`） | 无真实密钥；`.env` 已被 `.gitignore` 覆盖；缺变量时启动报错清晰 |
| Docker Compose 一键跑通 | `Dockerfile`、`docker-compose.yml`（`app` + `postgres` 两个 service，含 healthcheck、volume 持久化、`env_file`） | `docker compose up -d` 后容器健康；应用可达；重启容器数据不丢；`prisma migrate deploy` 可在容器内执行 |
| Prisma 初始化 | `prisma/schema.prisma`、首个 migration | migration 可重复执行；`migrate deploy` 与 `migrate dev` 行为一致 |
| CI | `.github/workflows/ci.yml` | `lint → test → build` 自动执行且全绿 |
| 代码规范 | ESLint + Prettier 配置、npm scripts | `npm run lint`、`npm run build` 通过 |

### 5.2 第 1 梯队：解锁

| 编号 | 关键产出物 | 验收标准 |
|---|---|---|
| P0-01 用户登录 | `lib/auth.ts`（Auth.js 配置 + `session()` + `requireUser()`）、`actions/auth.ts`（注册/登录/登出）、`app/(auth)/login/page.tsx`、`app/(dashboard)/layout.tsx` 路由保护 | ① 未登录访问 Dashboard → 302 到 `/login`；② 有效账号登录 → 建 Session 并进入 Dashboard；③ 登录失败 → 显示错误且不建 Session；④ 密码仅存 Argon2/bcrypt 哈希；⑤ 错误文案模糊化，不区分「用户不存在 / 密码错误」 |
| P0-02 Workspace | `actions/workspace.ts`（首次初始化/解析当前 Workspace）、`components/layout/WorkspaceSwitcher` | ① 无 Workspace 首次进入 → 自动创建或引导创建；② 已有 Workspace → 加载其任务；③ 访问他人 Workspace → `FORBIDDEN` |
| P0-13 基础权限校验 | `lib/permissions.ts`、`lib/errors.ts`（`ErrorCode` 含 `UNAUTHORIZED`/`FORBIDDEN`）、统一 `ActionResult<T>` 契约 | ① 每个 Action/Route 都走「校验 → 鉴权 → 授权 → 执行+失效」四步；② `workspaceId` 一律由服务端从 Session 推导，**不信任客户端入参**；③ 跨 Workspace 读写一律拒绝 |

### 5.3 第 2 梯队：首个业务闭环

| 编号 | 关键产出物 | 验收标准 |
|---|---|---|
| P0-03 创建 | `actions/issue.ts` `createIssue`、`components/issue/IssueForm`、`lib/validation.ts` | ① 合法标题提交 → 创建属于当前 Workspace 的 Issue；② 空标题 → 阻止提交并显示校验错误；③ 标题 >200 字符 → 拒绝并提示；④ 数据库失败 → 显示失败态，**不展示虚假成功** |
| P0-04 编辑 | `updateIssue`、编辑表单/弹窗 | ① 属于当前 Workspace → 保存最新内容；② 不属于 → 服务端拒绝修改 |
| P0-05 删除 | `deleteIssue`（`deleteMany({ where: { id, workspaceId } })` 保证幂等）、`DeleteIssueDialog` | ① 删除成功 → 从列表与看板消失；② 删除失败 → 卡片保留并可重试；③ 跨 Workspace 删除 → `NOT_FOUND`（天然不命中） |
| P0-06 状态管理 | Prisma `enum IssueStatus`、`lib/validation.ts` 枚举校验 | ① 四态固定；② 非法状态值无法入库（数据库枚举 + Zod 双保险） |
| P0-07 列表视图 | `app/(dashboard)/issues/page.tsx`（RSC 直读）、`components/issue/IssueList`、`loading.tsx`、空状态组件 | ① 展示当前 Workspace 全部 Issue；② 无数据 → 空状态 + 创建入口；③ 加载中 → 显示加载态且**无布局跳动** |
| P0-12 加载和错误状态 | 各交互组件五态、`error.tsx`、失败可重试入口 | ① 每个异步交互显式覆盖 `idle/loading/empty/error/success`；② 提交按钮在请求期间禁用（防重复提交）；③ 失败后可重试或恢复 |

### 5.4 第 3 梯队：看板与拖拽

| 编号 | 关键产出物 | 验收标准 |
|---|---|---|
| P0-08 看板视图 | `components/board/Board`、`BoardColumn`，视图由 `?view=board` 切换（URL Search Params） | ① 按四态分列展示；② 列表/看板通过 URL 参数切换且可分享、可回退；③ 空列有明确状态 |
| P0-09 拖拽改状态 | `@dnd-kit` 集成、`hooks/` 乐观更新、`updateIssueStatus`、拖拽失败回滚 | ① 拖入新列 → UI 立即响应，刷新后仍在新列；② 服务端失败 → **回滚到拖拽前快照**并提示，不留虚假 UI；③ 拖到无效区域 → 不发起请求；④ 存在 `pendingIds` 时禁止新的拖拽，避免响应覆盖；⑤ 稳定 `key={issue.id}` 避免错位 |

### 5.5 第 4 梯队：AI 闭环

| 编号 | 关键产出物 | 验收标准 |
|---|---|---|
| P0-10 AI 拆分任务 | `lib/ai.ts`（Prompt、超时 `AI_TIMEOUT_MS`、重试、限流、Token 统计）、`app/api/ai/breakdown/route.ts`、`components/issue/AiBreakdownPanel`、Zod `GeneratedSubtask` Schema、AI Provider Mock | ① 输入 10-4000 字符 → 返回 3-10 条结构化子任务；② 结果可查看/编辑/删除单条；③ Schema 校验失败 → **零写入**数据库并提示重新生成；④ 超时 → 停止加载 + 重试入口；⑤ `AI_API_KEY` 绝不出现在客户端或 `NEXT_PUBLIC_*`；⑥ Mock 测试覆盖成功、超时、无效输出三类 |
| P0-11 AI 确认创建 | `createIssuesFromSubtasks(confirmed[])`，`prisma.$transaction` 批量建 | ① 确认后才在当前 Workspace 批量创建 Issue；② 被用户删除的结果不落库；③ 事务失败 → 整体回滚，**不产生不可追踪的部分数据**；④ 当前由按钮 pending 禁止重复点击，服务端按 `workspaceId + requestId + index` 实现幂等，重复提交返回既有结果 |

### 5.6 第 5 梯队：部署

| 编号 | 关键产出物 | 验收标准 |
|---|---|---|
| P0-14 预览部署 | 可访问链接、健康检查页面、Sprint 结束即部署 | ① 通过链接可访问完整 MVP；② 每个 Sprint 结束完成一次部署；③ 关键页面有截图/链接留档 |
| P0-15 国内部署 | 腾讯云 Lighthouse/ECS、生产 `.env`（仅存服务器）、腾讯云 PostgreSQL、Nginx 反向代理、Certbot HTTPS、备份恢复脚本、部署文档 | ① 国内 HTTPS 地址可访问，登录/Issue/看板/AI 全流程在线可用；② 服务器重启后应用自动恢复、数据保持；③ `prisma migrate deploy` 成功且无数据丢失；④ 备份恢复至少演练一次；⑤ 密钥/`.env` 未进入 Git。**注意**：大陆地域 + 正式域名需提前确认 ICP 备案；学习阶段可先用公网 IP 或中国香港地域 |

---

## 6. 对照现状约束的说明

| 现状约束 | 对实现的具体影响 | 必须产出的东西 |
|---|---|---|
| **仅有 Next.js 脚手架** | 没有任何分层与配套目录，业务代码无处安放；默认首页需替换；`layout.tsx` 需改名并补元数据 | 完整目录分层、根布局改造、`page.tsx` 替换为路由入口、`.env.example`、ESLint/Prettier、CI |
| **依赖 PostgreSQL 持久化** | 拒绝 SQLite，本地也必须跑真实 PostgreSQL；所有查询以 `workspaceId` 为强制过滤维度；枚举与索引需在库层落地 | `schema.prisma`（User/Account/Session/Workspace/WorkspaceMember/Issue 六表）、`IssueStatus` 数据库枚举、`Issue(workspaceId,status)` 与 `Session(sessionToken)` 索引、migration、可重复执行的 `migrate deploy` |
| **需登录态鉴权** | 鉴权与授权不是「登录页」一件事，而是每个服务端入口的强制步骤；`workspaceId` 只能由服务端推导 | `lib/auth.ts`（Session + `requireUser()`）、`lib/permissions.ts`（归属判定）、统一 `ActionResult` + `ErrorCode`、受保护路由分组 `(dashboard)`、未登录/跨 Workspace 的自动化测试 |
| **AI 拆分子任务需人工确认后批量创建** | AI 与写库必须解耦：`lib/ai.ts` 只产出并校验，`actions/issue.ts` 才写库；批量必须走事务保证「全成功或全失败」 | `lib/ai.ts`、`app/api/ai/breakdown/route.ts`、`GeneratedSubtask` Zod Schema、可编辑/可删除的结果面板、`createIssuesFromSubtasks` 的 `$transaction`、防重复提交的前后端双保险、AI Provider Mock 三类测试、Token/请求次数记录 |
| **目标用 Docker Compose 本地一键跑通** | 本地与线上必须同为 PostgreSQL，避免「本地能跑线上挂」；容器需 healthcheck 与 volume，否则数据易丢；私有化 SQLite 方案不可用 | `Dockerfile`（多阶段构建）、`docker-compose.yml`（`app` + `postgres`，healthcheck + named volume + `env_file`）、等待数据库就绪后执行 `prisma migrate deploy` 的启动脚本、生产叠加 Nginx + Certbot、数据备份恢复说明 |

---

## 7. 风险与注意事项

| 风险 | 说明 | 对策 |
|---|---|---|
| 文档冲突误用 | `develop-plan.md` 的选型（`src/`、Zustand、SQLite、Vercel）若被沿用，会造成返工 | 归档该文档，实现前先对齐 ADR-001 |
| 认证阻塞面过大 | 登录是全部业务的前置，一旦 Auth.js 与 Prisma Adapter 配置卡住，整个 Sprint 1 停摆 | Sprint 0 就完成 Auth.js 配置与 Prisma 初始化，把风险前移 |
| 拖拽竞态 | 连续拖拽的乱序响应会覆盖最新状态，产生「UI 与数据库不一致」 | 以最后一次请求为准 + 失败回滚快照 + 稳定 `key` |
| AI 输出不可信 | 模型可能返回不合法 JSON 或空数组 | Zod 强校验 + 零写入 + 允许重新生成；绝不做「尽力解析后落库」 |
| 批量创建产生半成品数据 | 批量写中途失败会留下无法追踪的部分数据 | 必须走 `$transaction`；失败整体回滚 |
| 密钥泄露 | `AI_API_KEY`、`DATABASE_URL`、`AUTH_SECRET` 属高敏 | 只允许 `lib/` 下服务端模块读取；`.env` 不入 Git，仅提交 `.env.example` |
| 加载/错误态被后置 | 三态是 DoD 必选项，堆到最后补会大面积改动 | 每个 Story 交付时一并覆盖 `idle/loading/empty/error/success` |
| 本地与线上环境漂移 | 若本地用 SQLite 或不同 PG 版本，线上行为会不一致 | 本地与线上统一 PostgreSQL + Docker Compose，镜像版本对齐 |
| 范围蔓延 | P1/P2（搜索、标签、优先级、负责人、周报、Vue 对比）容易被顺手做掉 | 严守 `mvp-scope.md` §5 范围控制规则：P0 未全绿不进 P1 |
| 国内部署合规 | 大陆地域 + 正式域名需 ICP 备案 | 提前确认备案周期；学习阶段先用公网 IP 或中国香港地域验证 |

---

## 8. 执行状态与下一步

### 8.1 已完成：第 0 梯队（工程基线）

| 项 | 产出 | 状态 |
|---|---|---|
| 目录分层 | `components/{ui,layout,issue,board}`、`actions/`、`lib/`、`hooks/`、`types/`、`tests/{unit,e2e}` | ✅ |
| 环境变量契约 | `.env.example`（含 `DATABASE_URL`/`AUTH_SECRET`/`AUTH_TRUST_HOST`/`AI_*`/`POSTGRES_*`）、`lib/env.ts` 惰性校验 + 缺失时给出修复步骤 | ✅ |
| 数据层 | `prisma/schema.prisma` 六表 + `IssueStatus` 枚举 + `Issue(workspaceId,status)`、`Issue(workspaceId,createdAt)` 索引；迁移 `20260910000000_init` | ✅ |
| 容器化 | `Dockerfile`（多阶段）+ `docker/entrypoint.sh`（先 `migrate deploy` 再启动，带重试）+ `docker-compose.yml`（app + postgres，healthcheck + named volume）+ `.dockerignore` | ✅ |
| 健康检查 | `app/api/health/route.ts`：200 ok / 503 degraded，`degraded` 时列出缺失的环境变量 | ✅ |
| 依赖方向护栏 | ESLint `no-restricted-imports` 规则：`lib/` 不得引 `components/` 与 React；`components/` 不得直连 `lib/prisma`；`actions/` 不得引 UI 层 | ✅ |
| CI | `.github/workflows/ci.yml`：`npm ci` → `prisma generate` → `prisma validate` → Prettier → ESLint → build | ✅ |
| 代码规范 | Prettier 配置 + `.prettierignore`；`npm run format` / `format:check` | ✅ |

**验证结果**：`npm run lint` 通过、`npm run format:check` 通过、`npx prisma validate` 通过、`npx prisma generate` 成功、`npm run build` 成功（`/` 静态预渲染，`/api/health` 动态）；分层护栏经反向用例实测可拦截。

**尚未验证**（本机 Docker 守护进程未运行，无法执行镜像构建与容器启动）：`docker compose up -d --build` 的实际运行、容器内 `prisma migrate deploy`、`docker compose ps` 健康状态。需在 Docker Desktop 启动后补验。

### 8.2 已完成：第 1 梯队（P0-01 登录 / P0-02 Workspace / P0-13 权限校验）

| 项 | 产出 | 状态 |
|---|---|---|
| 错误模型 | `types/action.ts`（`ActionResult<T>` / `ErrorCode`）、`lib/errors.ts`（`AppError` + 安全文案映射） | ✅ |
| 校验真源 | `lib/validation.ts`（Zod v4：邮箱/密码/昵称/工作区名，`fieldErrorsOf`） | ✅ |
| 密码 | `lib/password.ts`（bcryptjs，纯 JS，避免容器内原生编译） | ✅ |
| 认证 | `lib/auth.ts`（Auth.js + Credentials + JWT；`getCurrentUser` / `requireUser` / `requireUserOrRedirect`）、`app/api/auth/[...nextauth]/route.ts` | ✅ |
| 权限 | `lib/permissions.ts`（`ensureWorkspaceForUser` 自动初始化、`assertWorkspaceAccess` 归属判定、`requireWorkspaceContext`） | ✅ |
| 变更入口 | `actions/auth.ts`（注册 / 登录 / 登出，统一 `ActionResult`） | ✅ |
| 界面 | `app/(auth)/{layout,login,register}`、`app/(dashboard)/{layout,issues}`、`components/ui/*` | ✅ |

**验证结果**
- 静态检查：ESLint 无告警、Prettier 全部符合、`prisma validate` 通过、`next build` 成功。
- 容器链路：`docker-compose up -d --build` 构建成功，db 与 app 均 healthy；app 容器启动时 `prisma migrate deploy` 自动应用迁移；`docker-compose restart app` 后服务自动恢复、数据保持（users/workspaces/issues 计数不变）。
- 运行时冒烟（`npm run smoke`，9 项全通过）：健康检查 `status=ok`、未登录访问 `/issues` 返回 307 → `/login`、匿名 `/api/auth/session` 为空、CSRF 签发、登录签发 `authjs.session-token`、会话解析出 `userId`、登录后可访问 `/issues` 且自动初始化 Workspace、**同一用户只创建 1 个 Workspace（并发回归）**、登出后会话失效。

**实施中修正的 4 个真问题（均已同步文档或写入测试）**
1. **构建依赖运行时配置**：`lib/prisma.ts` 原本在模块加载期构造 Prisma Client，`next build` 会读取 `DATABASE_URL` 导致构建失败（Docker build 阶段必然复现）。改为 `getPrisma()` 惰性构造；复验无 `.env` 时构建成功。
2. **去掉 PrismaAdapter**：它在「Credentials + JWT」下不会被调用，却会在模块加载期建连。改为 `authorize()` 内按需取客户端（`adr-001` §4）。
3. **健康检查误判**：`AI_API_KEY` 被当成硬性必需项，导致容器永久 unhealthy（AI 要到 Sprint 3 才落地）。改为环境变量分级：必需项（`DATABASE_URL`/`AUTH_SECRET`）缺失才 503，AI 缺失只记入 `disabledFeatures`。
4. **并发重复创建 Workspace**：Next 并发渲染 layout 与 page，两个 `requireWorkspaceContext()` 各建一个工作区（实测出现 2 条同 owner 记录）。改为 `React cache()` 按请求去重 + 确定性 ID `upsert` + `P2002` 兜底，并加入冒烟回归断言。

**尚未验证**：注册（Server Action）未在 HTTP 层驱动验证——Next 的 Server Action 编码不稳定，需 Playwright 才能可靠点击提交；Jest + Playwright 未接入（本机 `npm`/`npx` 被安全策略拦截，无法安装依赖）。

### 8.3 已完成：第 2 梯队（P0-03/04/05 CRUD、P0-06 状态管理、P0-07 列表视图、P0-12 五态）

| 项 | 产出 | 状态 |
|---|---|---|
| 领域类型 | `types/issue.ts`：`ISSUE_STATUSES` 单一真源、中文状态标签与徽标配色、客户端契约 `IssueItem`（日期统一 ISO 字符串，避免两端本地化差异） | ✅ |
| 校验 | `lib/validation.ts` 追加 `createIssueSchema` / `updateIssueSchema` / `deleteIssueSchema`，标题 trim 非空 ≤200、描述 ≤2000 且空串归一为 `null` | ✅ |
| 数据访问 | `lib/issues.ts`：`listIssues` / `createIssue` / `updateIssue` / `deleteIssue`，全部以 `workspaceId` 为强制过滤维度；更新与删除用 `updateMany`/`deleteMany` + `count` 判定，跨 Workspace 天然不命中 | ✅ |
| 变更入口 | `actions/issue.ts`：三个 Server Action，固定四步（校验 → 鉴权 → 授权 → 写库 + `revalidatePath`），统一返回 `ActionResult` | ✅ |
| 界面 | `components/issue/IssueForm.tsx`（创建）、`IssueList.tsx`（列表 + 空状态）、`IssueRow.tsx`（行内编辑与删除确认） | ✅ |
| 五态 | `app/(dashboard)/issues/page.tsx`（success）、`loading.tsx`（loading，骨架尺寸与真实页面一致以避免布局跳动）、`error.tsx`（error + 重试入口）、`IssueList` 空状态（empty）、按钮 pending 禁用（交互中） | ✅ |

**关键设计：编辑与删除用原生 `<details>/<summary>` 承载，而不是受控弹窗。** 换来三点：无 JS 时依然可用；展开状态由浏览器维护，组件内不需要任何本地 state（也因此避开了「在 effect 里同步 setState」的反模式）；表单始终存在于 SSR 输出中，自动化测试可直接提交。

**验证结果**：冒烟测试扩展到 20 项并全部通过，其中第 2 梯队相关 12 项覆盖——创建落库且默认 `BACKLOG`、空标题被拒、201 字标题被拒、编辑标题与状态生效、**跨 Workspace 编辑被拒绝且目标数据未被改动**、越权未在他人工作区留下数据、删除后记录消失且任务数回到基线。ESLint / Prettier / `next build` 全绿。

### 8.4 已完成：第 3 梯队（P0-08 看板视图、P0-09 拖拽改状态）

| 项 | 产出 | 状态 |
|---|---|---|
| 数据模型 | `Issue.position Int @default(0)`（步长 100，历史数据由 `createdAt` 兜底）；索引升级 `@@index([workspaceId, status, position])`；迁移 `20260911000000_add_issue_position` 离线生成 | ✅ |
| 视图切换 | `page.tsx` 读 `?view=board`（Next 16 searchParams 为 Promise）分发 `Board` / `IssueList`，头部列表/看板胶囊切换，URL 可分享可回退 | ✅ |
| 看板组件 | `components/board/{Board,BoardColumn,IssueCard}.tsx`：DndContext（closestCorners + PointerSensor 6px 激活 + KeyboardSensor 键盘可达）；四列由 `ISSUE_STATUSES` 派生不落库；列容器 `useDroppable`（空列可落）；`SortableContext` 列内排序；DragOverlay 提起态 | ✅ |
| 乐观更新 | `hooks/useBoardMove.ts`：onDragStart 快照 → onDragEnd 立即 setState 新排列并调 `moveIssue`；镜像用「渲染期对齐 props」模式同步（拖拽中/请求在途/失败未处理三种情况暂停同步） | ✅ |
| 失败回滚 | 失败（含网络 reject）整体恢复拖拽前快照 + 内联错误条（重试同 payload / 忽略）；onDragCancel 与落在无效区域同样恢复快照不发请求 | ✅ |
| 变更入口 | `actions/issue.ts` 新增 `moveIssue`（JS 直调，非 FormData）：四步不变；`lib/issues.ts` `moveIssueWithinWorkspace` 单事务「归属校验 → 改状态 → 整列重写 position → 事务期间新卡追加列尾」 | ✅ |
| 并发策略 | 整列快照覆盖（后写者赢）；请求在途卡片禁拖；跨 Workspace 伪造由 `workspaceId` 过滤天然拦截（NOT_FOUND） | ✅ |

**关键取舍**：`orderedIds` 发「目标列完整顺序」而不是前后邻居中点值——无浮点精度衰减、服务端免二次查邻居、并发语义清晰；列由状态派生不新增表；卡片排序步长 100 为未来的无拖拽插入留中缝。

**验证结果**：ESLint / Prettier / `next build` 全绿；迁移经 `migrate deploy` 应用；冒烟新增「看板视图 SSR 渲染四列与新卡片」断言（共 21 项）。**拖拽交互本体（拖拽反馈、乐观更新、回滚）依赖 JS 事件，冒烟只能覆盖 SSR 层，需浏览器手动验证或待 Playwright 解锁**。

### 8.5 第 4 梯队收尾：限流、Token 统计与服务端幂等

第 4 梯队主体（`lib/ai.ts`、`/api/ai/breakdown`、`AiBreakdownPanel`、`createIssuesFromSubtasks`）此前已落地，本轮补齐计划中列出的三项缺口。

| 项 | 产出 | 状态 |
|---|---|---|
| 限流 | `lib/rate-limit.ts`：单实例内存滑动窗口，按 `userId` 分桶，额度 `AI_RATE_LIMIT_PER_MINUTE`（默认 10）。放在参数校验之后、真正调用之前——**无效请求不占额度**。超限抛 `RATE_LIMITED`（429，文案含剩余等待秒数） | ✅ |
| Token 统计 | 真实调用取 SDK `usage`（input/output tokens）；mock 为估算值并以 `estimated` 标记。日志输出 `provider / attempt / subtasks / tokens(prompt,completion,total,estimated)`，**不打印 prompt 内容** | ✅ |
| 重试 | 仅对传输层 / 上游 5xx 这类瞬时故障重试 1 次。超时不重试（只让用户多等一个超时周期），Schema 不合不重试（重试等于放大错误） | ✅ |
| 服务端幂等 | 用客户端 `requestId`（UUID）推导确定性主键 `<requestId>:<index>`：重复提交命中既有主键直接返回、并发落败方撞 P2002 后读回结果、事务中途失败整批回滚。**不改 Schema，保持 ADR 冻结的六表模型** | ✅ |
| 错误码映射 | 路由按错误码映射状态码：400 入参 / 401 未登录 / 429 限流 / 502 输出不合规 / 503 未配置 / 504 超时 / 500 兜底。原先三个 AI 分支都返回 503，排障时无法区分「上游给了垃圾」与「上游太慢」 | ✅ |
| 冒烟扩展 | `scripts/smoke.mjs` 新增 `runAiChecks` 8 项：AI 能力启用前置检查、AI 面板 SSR 输出、未登录 401、过短 prompt 400、mock 成功（含 Token 字段）、无效输出 502、超时 504、限流第 `limit+1` 次 429（用独立账号打满额度，避免与功能用例互相干扰） | ✅ |

**关键取舍**：
1. **幂等键用确定性主键，而不是新增一张批次表** —— ADR 与 data-model 已冻结六表模型，为幂等加第七张表会与文档冲突；确定性主键让「重复提交不产生重复任务」由数据库主键唯一性天然保证，且批次成员可由主键前缀还原（`<requestId>:`）。
2. **限流放内存而非 Redis** —— MVP 单容器够用；多实例水平扩展时替换 `consumeRateLimit` 的 store 即可，签名不变（见 §9）。
3. **mock 走真实超时链路** —— mock 的超时分支不是「直接抛错」，而是挂起到 `AbortController` 真正 abort，因此冒烟覆盖的是生产同款的超时路径。

**验证状态**：
- ✅ ESLint 无告警、Prettier 全部符合、`next build` 成功（`/api/ai/breakdown` 已注册为动态路由）。
- ✅ 容器重建后 app 与 db 均 healthy；`/api/health` 返回 `status:ok`、`disabledFeatures:[]`（`AI_PROVIDER=mock` 视为 AI 可用）。
- ✅ 冒烟扩展到 **29 项并全部通过**（21 + 8）。第 4 梯队 8 项的实测结果：未登录 401、过短 prompt 400、mock 成功返回 3 条子任务且 `totalTokens=193`、无效输出 502 `AI_INVALID_OUTPUT`、超时 504 `AI_TIMEOUT`（真实走 AbortController 链路）、限流放行 5/5 后第 6 次 429、AI 面板 SSR 输出、AI 能力启用前置检查。
- ⏳ **仍无自动化覆盖**：`createIssuesFromSubtasks` 的幂等（确定性主键）与「确认创建」按钮点击链路、以及看板拖拽交互，均依赖客户端 JS 事件或 JS 直调 Action，HTTP 冒烟只能覆盖服务端契约与 SSR 渲染，需手动验证或待 Playwright 解锁。

### 8.5.1 增量更新（2026-09-12）

第 4 梯队收尾后的增量进展（对应提交历史「加固认证限流」至「迁移认证与页面主题组件」）。**以下为该批次时点数据，当前值以 §8.5.2 与[文档中心 README](../README.md) 为准**：

| 项 | 内容 |
|---|---|
| 测试工具链解锁 | Jest 接入并纳入 CI（9 套件 20 用例全绿）；Playwright 接入基础用例；`npm test` / `test:e2e` 命令已存在 |
| P0-5 修复 | 看板整列重写从事务内 N 次串行 UPDATE 改为单条 SQL（`buildMoveIssueUpdate` + `WITH ORDINALITY`），含 SQL 构造单元测试；方案见 `p0-5-move-issue-bulk-rewrite.md` |
| 注册 TOCTOU 修复 | 删除先查后建的 `findUnique`，直接 `create` 并对 P2002 返回 `CONFLICT`（评审 P1-2），抽 `lib/db-errors.ts` 复用 |
| 认证限流加固 | 登录按「邮箱 + IP」组合分桶且只对失败计数、成功即清零；注册按 IP 每次尝试计数；限流表加容量上限与过期清理（详见 `../02-architecture/api-contracts.md` §3） |
| AI 确认死路修复 | AI 输出侧强制 3-10 条、用户确认入参放宽到 1 条（详见 `../02-architecture/api-contracts.md` §6） |
| UI 迁移 | 设计令牌三层体系落地 `app/globals.css`（`[data-theme]` 驱动）；shadcn/ui 基础组件与业务组件分批迁移（ADR-006，进行中） |
| 冒烟扩展 | 29 项 → 36 项 |

### 8.5.2 架构评审与代码审查整改（2026-09-12 第二批）

全量代码审查（含 2026-09-11 评审的 P0 项复核与新一轮安全审查）后落地的整改，对应提交 `cc1bfbc` 至 `3ff7a96`：

| 类别 | 内容 |
|---|---|
| 认证安全（P0） | 登录限流计数下沉到 `authorize()`（新 `lib/auth-rate-limit.ts`）——凭据回调 `/api/auth/callback/credentials` 原先可完全绕开限流，现与表单同层受保护；`clientIpKey()` 在不可信 IP 维度返回 `null` 并跳过按 IP 的桶，消除「所有客户端共享全局桶 → 全站登录锁死」的 DoS 开关；用户不存在时以固定 dummy 哈希对齐比对耗时，堵住计时枚举侧信道 |
| 契约（P0） | 批量创建拆出 `lib/issue-batch.ts`（评审 P0-1）；幂等主键加 `workspaceId` 前缀，阻断跨工作区存在性探测（评审 P0-2）；`position` 接在列内最大值之后（评审 P2-3）；AI 超时按 `abortSignal.aborted` 归类为 504，不再误报 502；拖拽入参 id 加长度上限 |
| 结构（P0/P1） | 新增 `proxy.ts` 路由保护（评审 P0-3）；根级 `error.tsx`/`global-error.tsx`/`not-found.tsx` 与 `next.config.ts` 安全响应头（评审 P1-7）；`listIssues` 加 500 条硬上限（评审 P0-4 过渡方案）；校验常量统一引用（评审 P1-1） |
| 体验与无障碍 | 表单错误通过 `aria-describedby` 与输入框关联（UI 审计 P0-7）；AI 面板候选项稳定 `clientId`（评审 P2-2）且请求可取消（评审 P2-1）；看板同步期间可见提示；骨架与页面统一容器宽度（UI 审计 P0-3）；「已保存」提示不再滞留 |
| 护栏与卫生 | ESLint 补 `lib→actions`、`lib→app`、`actions→app` 反向边（评审 P1-5 部分）；删除 9 个 `.gitkeep`（评审 P2-10）；`types/issue.ts` 归因注释修正（UI 审计 P2-25） |
| 测试 | 新增 `auth-rate-limit`（6 用例）与 `issue-batch`（6 用例）套件；冒烟新增「REST 回调限流覆盖」断言并按目标环境自适应（40 项）；Jest 达 11 套件 31 用例 |

**验证结果**：`npm run lint` 通过、`npm test` 32/32 通过、`npm run build` 成功（Proxy 已注册）。冒烟需在运行中的服务上执行验证。

### 8.6 下一步：第 5 梯队（P0-14 预览部署、P0-15 国内部署）

1. 预览部署：`Dockerfile` + `docker-compose.prod.yml` 已在工作区，需补齐可访问链接、健康检查留档、每 Sprint 一次部署。
2. 国内部署：腾讯云 Lighthouse/ECS + 腾讯云 PostgreSQL + Nginx + Certbot；`prisma migrate deploy` 演练、备份恢复演练、密钥不进 Git。
3. 自动化测试扩展：Jest 与 Playwright **均已接入**（2026-09-12：Jest 11 套件 31 用例、Playwright 基础用例）；下一步扩充 E2E 覆盖看板拖拽、AI 面板确认创建与批量创建幂等，用例稳定后纳入 CI 门禁。

> 第 0-4 梯队已落地并经容器运行时验证（冒烟脚本定义 40 项（实际通过数随环境变化））；第 5 梯队（P0-14/P0-15）待预览与云上验证。

### 9. 已知限制

| 限制 | 说明 | 解除条件 |
|---|---|---|
| 限流为单实例内存计数 | `lib/rate-limit.ts` 用进程内 Map：多副本部署时各副本独立计数，实际额度会被放大。AI 限流按 `userId` 分桶（有界）；登录邮箱桶按「邮箱+IP」分桶、key 含不可信时的固定后缀，均加了容量上限（5000）与过期清理兜底 | 接入 Redis（`INCR` + `EXPIRE`）替换 store，函数签名不变 |
| 按 IP 限流依赖代理覆写请求头 | 生产且 `TRUST_PROXY=false` 时应用**主动跳过** IP 维度（登录-IP 桶与注册-IP 桶不参与），避免所有客户端共享一个可被单点打满的全局桶。此时代码库不感知真实来源，登录退守邮箱失败计数，**注册接口无频次防护** | 生产 Nginx 配置 `proxy_set_header X-Forwarded-For $remote_addr;` 且应用设置 `TRUST_PROXY="true"`；未配置时用 Nginx `limit_req` 补齐（见 `../02-architecture/api-contracts.md` §3） |
| 登录失败过多会在窗口内拒绝该邮箱 | IP 可信时拒绝「邮箱+IP」组合（攻击者无法锁死他人）；IP 不可信时退化为按邮箱拒绝——攻击者可持续对他人邮箱打满失败计数形成锁号，窗口 1 分钟、成功登录即清零 | 引入验证码 / 邮件解锁，或改为指数退避延迟而非硬拒绝；根本上需可信代理提供 IP 维度 |
| 批量创建的幂等键由客户端生成 | 客户端重装/清缓存后重新生成 `requestId`，同一批候选在有新 requestId 时会被视为新批次（符合预期，但用户可能因此重复创建） | 引入服务端侧候选集持久化（如把拆分结果落库为草稿） |
| 拖拽与 AI 面板点击链路无自动化覆盖 | 二者都依赖客户端 JS 事件，HTTP 冒烟只能覆盖服务端契约与 SSR 渲染 | Playwright 已接入；需扩充拖拽与确认创建用例 |
| ~~Jest / Playwright 未接入~~（已解除） | 原 `npm`/`npx` 安全策略拦截已不再阻塞：Jest 11 套件 31 用例、Playwright 基础用例均已运行 | 扩充 E2E 用例并纳入 CI 门禁 |
| 运行镜像保留完整 `node_modules` | 为在容器内执行 Prisma 迁移；体积偏大 | 切换 Next.js standalone 输出并把迁移拆成独立任务 |


