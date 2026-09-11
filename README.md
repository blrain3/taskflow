# TaskFlow

自然语言驱动的轻量任务协作平台（Linear 风格）。核心差异化能力：用自然语言描述工作，由 AI 拆解为结构化子任务，用户确认后批量创建。

本仓库处于 **Sprint 0（工程基线）已完成、Sprint 1（认证与 Issue 垂直切片）待启动** 阶段。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 App Router（根目录 `app/`，不迁移到 `src/`） |
| UI | React 19 + Tailwind CSS v4 |
| 语言 | TypeScript `strict` |
| 数据库 | PostgreSQL 16（本地 Docker，线上腾讯云） |
| ORM | Prisma 6 |
| 认证 | Auth.js（next-auth v5）+ Prisma Adapter，Credentials Provider |
| AI | Vercel AI SDK + OpenAI-compatible（默认 DeepSeek） |
| 拖拽 | `@dnd-kit` |
| 校验 | Zod（前后端共用同一份 Schema） |
| 容器 | Docker + Docker Compose |
| CI | GitHub Actions（lint → format → build） |

---

## 目录结构

```text
app/
├── api/health/route.ts    # 健康检查（应用 + 数据库）
├── layout.tsx             # 根布局
├── page.tsx               # 落地页（Sprint 1 起被 (auth)/(dashboard) 取代）
└── globals.css            # Tailwind 入口与设计令牌

components/                # L2 组件层（ui / layout / issue / board）
actions/                   # L3 Server Actions：变更入口
lib/                       # L4 领域与数据访问层
├── env.ts                 # 服务端环境变量契约（惰性校验）
└── prisma.ts              # Prisma Client 单例
hooks/  types/  tests/     # 预留：客户端 hooks、领域类型、单元与 E2E 测试
prisma/                    # Schema 与迁移
docker/entrypoint.sh       # 容器启动：先迁移后启动
docs/                      # 架构、ADR、Story、DoD、Sprint 计划、UI 规范
```

**依赖方向铁律**：`app/` → `components/` → `actions/` → `lib/` → PostgreSQL，只允许向下依赖。
`lib/` 不得 import `components/`；`components/` 不得直接 import `lib/prisma`。

---

## 快速开始

### 方式一：Docker Compose 一键启动（推荐）

```bash
cp .env.example .env      # 至少把 AUTH_SECRET 换成随机值：openssl rand -base64 32
docker compose up -d --build
```

启动后访问 <http://localhost:3000/api/health>，看到 `"status": "ok"` 即表示应用与数据库均可用。

```bash
docker compose ps          # 查看两个服务的健康状态
docker compose logs -f app # 跟踪应用日志（含迁移执行结果）
docker compose down        # 停止（保留数据卷）
docker compose down -v     # 停止并清空数据库数据
```

应用容器启动时会自动执行 `prisma migrate deploy`，失败会重试最多 30 次。

### 方式二：裸机开发（只把数据库放进容器）

```bash
docker compose up -d db                 # 只启动 PostgreSQL
cp .env.example .env                    # DATABASE_URL 已指向 127.0.0.1:5432
npm install
npx prisma migrate deploy               # 或 npm run db:migrate（开发期创建新迁移）
npm run dev
```

> **主机名务必用 `127.0.0.1`，不要写 `localhost`。** Windows + Docker Desktop 下 `localhost`
> 会被优先解析为 IPv6 `::1`，而 Docker 只把端口发布在 IPv4 上，Prisma 会卡 5 秒后报
> `Can't reach database server`（同一网络下 `127.0.0.1` 只需 9ms）。`.env.example` 已按此设置。

---

## 环境变量

全部变量见 `.env.example`。`.env` 只存在于本地与服务器，**不进 Git**。

| 变量 | 用途 | 可否暴露到客户端 |
|---|---|---|
| `DATABASE_URL` | Prisma 连接串 | 否 |
| `AUTH_SECRET` | Session 签名 | 否 |
| `AUTH_TRUST_HOST` | 自托管下必须为 `true` | 否 |
| `AI_BASE_URL` | OpenAI-compatible 端点 | 否 |
| `AI_API_KEY` | DeepSeek Key | **严禁** |
| `AI_MODEL` | 模型名 | 否 |
| `AI_TIMEOUT_MS` | AI 调用超时（默认 30000） | 否 |
| `AI_PROVIDER` | `openai`（默认，需 Key）或 `mock`（离线预设样本，无需外部依赖） | 否 |
| `AI_RATE_LIMIT_PER_MINUTE` | 每用户每分钟 AI 调用次数（默认 10） | 否 |
| `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE` | 同一邮箱每分钟登录**失败**次数（默认 10，成功即清零） | 否 |
| `AUTH_IP_RATE_LIMIT_PER_MINUTE` | 同一来源 IP 每分钟登录尝试次数（默认 30） | 否 |
| `AUTH_REGISTER_RATE_LIMIT_PER_MINUTE` | 同一来源 IP 每分钟注册尝试次数（默认 5） | 否 |
| `POSTGRES_USER/PASSWORD/DB` | 本地容器初始化 | 否 |

> 规则：任何以 `AI_` 开头或含 `SECRET` / `KEY` 的变量，只能被 `lib/` 下的服务端模块读取（`lib/env.ts` 已通过 `server-only` 强制约束）。
>
> 认证限流的 key 策略与「按 IP 限流的可信前提」见 `docs/02-architecture/api-contracts.md` §3。

变量缺失时不会静默降级：`lib/env.ts` 会抛出包含修复步骤的错误，`/api/health` 会以 503 返回缺失的变量名。

---

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器（Turbopack，Next 16 默认） |
| `npm run build` | 生产构建（含 TypeScript 类型检查） |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:migrate` | 创建并应用迁移（开发期） |
| `npm run db:deploy` | 应用已有迁移（部署与容器启动使用） |
| `npm run db:studio` | 打开 Prisma Studio 查看数据 |
| `npm run smoke` | HTTP 冒烟测试（37 项：健康检查、重定向、登录/登出、Workspace 初始化、Issue CRUD 与越权、看板 SSR、列表排序、AI 拆分各分支与限流、认证限流），需应用已在 3000 端口运行 |

---

## 验证

### HTTP 冒烟测试

```bash
npm run smoke                    # 默认 http://localhost:3000
npm run smoke -- http://host:3000
```

覆盖 20 项：健康检查、未登录重定向、匿名会话为空、CSRF、登录签发会话 Cookie、会话解析出用户、登录后访问受保护页面（含 Workspace 自动初始化）、并发重复创建回归、创建任务并默认 `BACKLOG`、空标题被拒、超长标题被拒、编辑标题与状态生效、**跨 Workspace 编辑被拒绝且数据未被改动**、越权未在他人工作区留下数据、删除后记录消失且任务数回到基线、登出后会话失效。

实现方式：借助 Next 的渐进增强，直接把页面里表单的隐藏 `$ACTION_*` 字段原样回放，从而在**不依赖浏览器**的情况下真实触发 Server Action，因此不需要 Playwright 就能覆盖 CRUD 与越权。

脚本会往数据库写入固定测试账号 `smoke@taskflow.local` 与 `smoke-b@taskflow.local`（后者用于越权验证），并重置它们的工作区，**不要在生产库上运行**。

### 其他检查

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # 生产构建（含 TypeScript 类型检查）
npx prisma validate   # Schema 校验
```

> 单元测试与 E2E（Jest / Playwright）尚未接入；冒烟脚本是当前唯一的运行时验证手段。

---

## 数据库

```bash
npm run db:migrate -- --name add_some_field   # 开发期：改 schema 后生成迁移
npm run db:deploy                             # 生产/容器：只应用已有迁移，可重复执行
```

备份与恢复（本地示例）：

```bash
docker compose exec db pg_dump -U taskflow -d taskflow > backup.sql
docker compose exec -T db psql -U taskflow -d taskflow < backup.sql
```

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/mvp-scope.md`](docs/mvp-scope.md) | MVP 范围与 P0/P1/P2 优先级 |
| [`docs/architecture.md`](docs/architecture.md) | 系统架构（五层、数据流、安全、部署） |
| [`docs/adr-001-technical-decisions.md`](docs/adr-001-technical-decisions.md) | 关键技术决策 |
| [`docs/user-stories.md`](docs/user-stories.md) | User Story 与 Given-When-Then 验收标准 |
| [`docs/definition-of-done.md`](docs/definition-of-done.md) | Story 完成门槛 |
| [`docs/sprint-plan.md`](docs/sprint-plan.md) | Sprint 划分与降级规则 |
| [`docs/development-roadmap.md`](docs/development-roadmap.md) | 分阶段开发计划与出口条件 |
| [`docs/p0-delivery-plan.md`](docs/p0-delivery-plan.md) | P0 差距分析、优先级梯队与逐项验收标准 |
| [`docs/ui-design-system-v2.md`](docs/ui-design-system-v2.md) | UI 设计规格（令牌、信息架构、无障碍） |

> 注：`docs/develop-plan.md` 为早期草案，其技术选型（`src/`、Zustand、SQLite、Vercel）与 ADR-001 冲突，**不作为实现依据**。

---

## 已知限制与后续工作

- 业务功能进度：认证与 Workspace、Issue CRUD 与列表已完成；看板拖拽、AI 拆分属 Sprint 3-4。
- 单元测试与 E2E 尚未接入（Jest / Playwright 计划在 Sprint 3 引入），CI 目前只跑 lint、Prettier、build；运行时验证依赖 `npm run smoke`。
- 看板视图与拖拽、搜索、筛选、优先级、标签均属后续梯队。
- `AI_*` 环境变量属「可选功能级」：未配置时 AI 能力关闭，但服务健康检查仍为 `ok`。`/api/health` 的 `disabledFeatures` 会列出被关闭的能力。
- 运行镜像保留了完整 `node_modules` 以便容器内执行 Prisma 迁移；后续可切换 Next.js standalone 输出并拆分迁移任务来压缩体积。
- 中国大陆地域 + 正式域名部署需先完成 ICP 备案；学习阶段可用公网 IP 或中国香港地域验证。
