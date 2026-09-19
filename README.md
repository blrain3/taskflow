# TaskFlow

面向个人开发者与小型工作组的写作平台（Markdown 优先），带 Workspace 权限、版本历史与 AI 写作辅助。

> **方向说明**：产品方向已由 [ADR-007](docs/02-architecture/adr-007-writing-platform-direction.md) 确定为「多人写作平台」，第一阶段是面向多人 Workspace 的**单人写作 MVP**（成员访问不等于实时协同编辑）。写作能力（Document / DocumentVersion、编辑器、自动保存与版本恢复）已落地；原 Issue 看板保留为**历史模块**，不再扩展，但仍是回归基线。
>
> **完成度**：Sprint 0–4 与 P0 整改已完成并通过容器验证。日本服务器源站已完成 Docker、PostgreSQL 迁移、Nginx 与 HTTPS 部署，地址为 <https://blrain.us.ci>；当前公网访问仍受 Cloudflare Managed Challenge 拦截，需在 Cloudflare 放行后才算对外可用。

---

## 本地开发环境（WSL）

推荐在 WSL2 Ubuntu 24.04 中开发，代码放 ext4 文件系统（**不要**放 `/mnt/d`，I/O 慢约 50 倍）。

```bash
git clone git@github.com:blrain3/taskflow.git ~/projects/taskflow
cd ~/projects/taskflow
npm install
npx prisma generate
cp .env.example .env      # 按需填写 DATABASE_URL / AUTH_SECRET
npm run dev
```

VS Code 用 Remote-WSL 打开：在 WSL 内执行 `code .`。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 App Router（根目录 `app/`，不迁移到 `src/`） |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui（复制源码到 `components/ui/`） |
| 语言 | TypeScript `strict` |
| 数据库 | PostgreSQL 16（本地 Docker，线上腾讯云） |
| ORM | Prisma 6 |
| 认证 | Auth.js v5 Credentials Provider + JWT 会话（**不接 Prisma Adapter**，见 ADR-001 §4） |
| AI | Vercel AI SDK + OpenAI-compatible（默认 DeepSeek）；支持 `mock` 提供方用于离线开发与冒烟 |
| 校验 | Zod（前后端共用同一份 Schema，唯一真源在 `lib/validation.ts`） |
| 容器 | Docker + Docker Compose |
| CI | GitHub Actions（install → prisma → format → lint → build → 单元测试） |

---

## 目录结构

```text
app/
├── (auth)/                # 未登录可访问：登录、注册
├── (dashboard)/           # 受保护业务区
│   ├── issues/            # 任务列表 / 看板（历史模块）
│   └── documents/         # 文档列表、编辑器、版本历史
├── api/                   # health（健康检查）、ai/breakdown、auth/[...nextauth]
├── error.tsx / global-error.tsx / not-found.tsx
├── layout.tsx / page.tsx / globals.css
components/
├── ui/                    # 设计系统原子组件（button / input / dialog / badge …）
├── app-nav.tsx            # 外壳跨页导航
├── issue/  board/         # 任务与看板组件（历史模块）
└── document/              # 文档编辑器、新建/删除表单、版本历史
actions/                   # Server Actions：auth.ts / issue.ts / document.ts
lib/                       # 领域与数据访问层（ai / documents / issues / permissions / validation …）
hooks/                     # 客户端 hooks（useBoardMove）
types/                     # 前后端共用契约（action / issue / document）
prisma/                    # schema.prisma 与 migrations/
docker/entrypoint.sh       # 容器启动：先迁移后启动
scripts/smoke.mjs          # HTTP 层冒烟测试
docs/                      # 文档中心，入口见 docs/README.md
```

**依赖方向铁律**：`app/` → `components/` → `actions/` → `lib/` → PostgreSQL，只允许向下依赖。
`lib/` 不得 import `components/` 或 `actions/`；`components/` 不得直接 import `lib/prisma`。这两条已用 ESLint `no-restricted-imports` 固化为错误。

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

> 若本机的 Compose 是独立安装版（`docker compose` 报 unknown command），把上面的 `docker compose` 换成 `docker-compose` 并指定文件：`docker-compose -f docker-compose.yml up -d --build`。

### 方式二：裸机开发（只把数据库放进容器）

```bash
docker compose up -d db                 # 只启动 PostgreSQL
cp .env.example .env                    # DATABASE_URL 已指向 127.0.0.1:5432
npm install
npm run db:deploy                       # 应用已有迁移（开发期改 schema 用 npm run db:migrate）
npm run dev
```

> **主机名务必用 `127.0.0.1`，不要写 `localhost`。** Windows + Docker Desktop 下 `localhost`
> 会被优先解析为 IPv6 `::1`，而 Docker 只把端口发布在 IPv4 上，Prisma 会卡 5 秒后报
> `Can't reach database server`（同环境下 `127.0.0.1` 只需 9ms）。`.env.example` 已按此设置。

---

## 环境变量

全部变量见 `.env.example`（与 `lib/env.ts` 的声明保持一一对应）。`.env` 只存在于本地与服务器，**不进 Git**。

| 变量 | 用途 | 可否暴露到客户端 |
|---|---|---|
| `DATABASE_URL` | Prisma 连接串 | 否 |
| `AUTH_SECRET` | 会话签名密钥（`openssl rand -base64 32`） | 否 |
| `AUTH_TRUST_HOST` | 自托管（Docker / 云服务器）下必须为 `true` | 否 |
| `TRUST_PROXY` | 是否信任反向代理注入的 `X-Forwarded-For` / `X-Real-IP`。**生产默认 `false`**：未设为 `true` 时应用会整体跳过按 IP 的限流 | 否 |
| `AI_PROVIDER` | `openai`（默认，需 Key）或 `mock`（离线预设样本，无需外部依赖） | 否 |
| `AI_BASE_URL` / `AI_MODEL` | OpenAI-compatible 端点与模型名 | 否 |
| `AI_API_KEY` | 模型服务密钥 | **严禁** |
| `AI_TIMEOUT_MS` | AI 调用超时（默认 30000） | 否 |
| `AI_RATE_LIMIT_PER_MINUTE` | 每用户每分钟 AI 调用次数（默认 10） | 否 |
| `AUTH_LOGIN_RATE_LIMIT_PER_MINUTE` | 同一「邮箱 + IP」每分钟登录**失败**次数（默认 10，成功即清零） | 否 |
| `AUTH_IP_RATE_LIMIT_PER_MINUTE` | 同一来源 IP 每分钟登录尝试次数（默认 30） | 否 |
| `AUTH_REGISTER_RATE_LIMIT_PER_MINUTE` | 同一来源 IP 每分钟注册尝试次数（默认 5，每次尝试都计数） | 否 |
| `POSTGRES_USER/PASSWORD/DB` | 本地容器初始化 | 否 |

> 规则：任何以 `AI_` 开头或含 `SECRET` / `KEY` 的变量，只能被 `lib/` 下的服务端模块读取（`lib/env.ts` 已通过 `server-only` 强制约束）。
>
> 限流 key 策略与「按 IP 限流的可信前提」见 [API 契约](docs/02-architecture/api-contracts.md) §3；生产必须由 Nginx 覆写 `X-Forwarded-For` 并设 `TRUST_PROXY=true`，否则注册接口没有频次防护。

变量缺失时不会静默降级：`lib/env.ts` 会抛出包含修复步骤的错误，`/api/health` 返回 503。响应体分环境：**非生产**会列出 `missingEnv` 与 `disabledFeatures` 便于排查，**生产只返回 `{status}`**（公开端点不泄露配置状态，生产排障需看容器日志）。`AI_*` 属「可选功能级」：未配置时 AI 能力关闭，但健康检查仍为 `ok`。完整契约见 [API 契约](docs/02-architecture/api-contracts.md) §8。

---

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器（Turbopack，Next 16 默认） |
| `npm run build` | 生产构建（含 TypeScript 类型检查） |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint（含依赖方向护栏） |
| `npm run format` / `npm run format:check` | Prettier 格式化 / 检查 |
| `npm test` / `npm run test:watch` | Jest 单元测试（`--runInBand`）/ 监听模式 |
| `npm run test:e2e` | Playwright E2E（当前仅基础用例，未纳入 CI） |
| `npm run smoke` | HTTP 层冒烟测试，需应用已在 3000 端口运行 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:migrate` | 创建并应用迁移（开发期） |
| `npm run db:deploy` | 应用已有迁移（部署与容器启动使用） |
| `npm run db:studio` | 打开 Prisma Studio 查看数据 |

---

## 验证

### HTTP 冒烟测试

```bash
npm run smoke                    # 默认 http://localhost:3000
npm run smoke -- http://host:3000
```

脚本内**定义 40 项检查**，覆盖健康检查、未登录重定向、CSRF、登录/登出、Workspace 自动初始化与并发创建回归、Issue CRUD 与跨 Workspace 越权、看板 SSR、列表排序、AI 拆分各分支（成功 / 无效输出 / 超时 / 限流）、认证限流（登录失败桶与注册桶）。

**实际执行数随环境自适应**：依赖 IP 维度的用例在「生产模式且未信任代理」的目标上自动跳过，可用 `SMOKE_EXPECT_IP_RATE_LIMIT=true` 强制开启。通过数与失败明细以**脚本输出为准**，本文不写死数字。

实现方式：借助 Next 的渐进增强，直接回放页面表单里的隐藏 `$ACTION_*` 字段，从而在**不依赖浏览器**的情况下真实触发 Server Action，因此不需要 Playwright 就能覆盖 CRUD 与越权。

脚本会往数据库写入固定测试账号 `smoke@taskflow.local` 与 `smoke-b@taskflow.local`（后者用于越权验证），并重置它们的工作区，**不要在生产库上运行**。

### 其他检查

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # 生产构建（含 TypeScript 类型检查）
npm test              # Jest 单元测试
npx prisma validate   # Schema 校验
```

测试分层、覆盖缺口与通过门槛见 [测试策略](docs/02-architecture/testing-strategy.md)；套件与用例数量以 `npm test` 输出为准。

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

生产备份、恢复演练与发布回滚见 [运维手册](docs/02-architecture/operations-runbook.md)。

---

## 文档中心

**入口是 [`docs/README.md`](docs/README.md)** —— 它维护完整的文档索引、阅读路径与文档质量门禁。高频入口：

| 文档 | 内容 |
|---|---|
| [MVP 范围](docs/01-product/mvp-scope.md) | 第一阶段单人写作 MVP 的边界与优先级 |
| [User Stories](docs/01-product/user-stories.md) | US-DOC-* 核心行为与验收标准 |
| [架构说明](docs/02-architecture/architecture.md) | 分层、数据流、安全与状态约定 |
| [技术决策 ADR-001](docs/02-architecture/adr-001-technical-decisions.md) | 技术选型及理由 |
| [API 契约](docs/02-architecture/api-contracts.md) | ActionResult、限流、AI 接口、幂等与文档变更契约 |
| [数据模型](docs/02-architecture/data-model.md) | 模型关系与迁移规则（Schema 为最终事实源） |
| [测试策略](docs/02-architecture/testing-strategy.md) | 测试分层、当前覆盖与通过门槛 |
| [运维手册](docs/02-architecture/operations-runbook.md) | 腾讯云部署、发布回滚、备份恢复 |
| [提交规则](docs/03-development/commit-rules.md) / [Definition of Done](docs/03-development/definition-of-done.md) | 工程纪律与完成门槛 |

---

## 疑难排查

| 现象 | 处理 |
|---|---|
| `Can't reach database server` | `DATABASE_URL` 主机名改成 `127.0.0.1`（见上文快速开始） |
| 容器 unhealthy | `docker compose ps` + `curl /api/health`；516 类问题优先看 `missingEnv` |
| 改了 `.env` 不生效 | `docker-compose restart` **不会重读 `env_file`**，需 `down app && up -d --no-build` |
| 登录失败 | 确认 `AUTH_SECRET`、`AUTH_TRUST_HOST=true`、反向代理传递的 Host |
| 生产上传正文被拒 | 除应用侧 `serverActions.bodySizeLimit`（3MB）外，Nginx 还需 `client_max_body_size 3m;` |

更多故障处理见 [运维手册 §6](docs/02-architecture/operations-runbook.md)。

---

## 已知限制与后续工作

- **部署状态**：日本单实例源站已部署（Docker Compose + Nginx + Certbot，2026-09-14）；公网可用性仍受 Cloudflare Challenge 影响。备份恢复演练、Redis 限流、多实例迁移 Job 和持续交付尚未完成。
- **限流为单实例内存计数**：多副本部署时各副本独立计数，实际额度会被放大；接入 Redis 后替换 store 即可，函数签名不变。
- **按 IP 限流依赖代理覆写请求头**：生产未设 `TRUST_PROXY=true` 时会整体跳过该维度，需用 Nginx `limit_req` 补齐注册路径。
- **拖拽与 AI 面板点击链路无自动化覆盖**：二者依赖客户端 JS 事件，HTTP 冒烟只能覆盖服务端契约与 SSR；Playwright 仅基础用例且未纳入 CI。
- **没有请求 ID / 结构化日志**：可观测性目前只有 `console.log/error`，目标契约见 [可观测性规范](docs/02-architecture/observability.md)。
- **Issue 看板为历史模块**：功能完整但不再扩展，按 ADR-007 只作为回归基线保留。
- **运行镜像保留完整 `node_modules`** 以便容器内执行 Prisma 迁移，体积偏大；后续可切 Next.js standalone 输出并拆分迁移任务。
- **中国大陆地域 + 正式域名**需先完成 ICP 备案；学习阶段可用公网 IP 或中国香港地域验证。
