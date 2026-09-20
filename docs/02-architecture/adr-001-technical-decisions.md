# ADR-001：TaskFlow MVP 技术决策

- 状态：已接受
- 日期：2026-09-10（2026-09-12 同步 ADR-006 与测试工具链结论）
- 决策人：个人开发者
- 适用范围：TaskFlow MVP

## 1. 背景

当前仓库是 Next.js 16.x 的最小项目，使用根目录 `app/` 结构。MVP 需要在有限时间内完成认证、任务管理、AI 调用、测试和部署。

本 ADR 用于固定关键技术选择，避免开发过程中频繁更换方案。

## 2. 决策摘要

| 领域 | 决策 |
|---|---|
| Web 框架 | Next.js 16.x App Router |
| React | React 19.x |
| 语言 | TypeScript strict |
| 目录结构 | 保留根目录 `app/`，不迁移到 `src/` |
| 样式 | Tailwind CSS v4（语义令牌）；组件层为 shadcn/ui（见 ADR-006） |
| 认证 | Auth.js Credentials Provider（JWT 会话策略）+ Prisma 持久化用户数据 |
| 数据库 | PostgreSQL；本地 Docker，线上腾讯云 PostgreSQL |
| ORM | Prisma |
| AI | Vercel AI SDK + OpenAI-compatible Provider，优先 DeepSeek |
| 状态管理 | Server-first；URL 状态 + React 本地状态 |
| 全局状态 | MVP 暂不引入 Zustand |
| 拖拽 | `@dnd-kit` |
| 单元测试 | Jest + React Testing Library（Jest 已接入；RTL 待接入） |
| E2E | Playwright（已接入，用例扩充中） |
| 代码规范 | ESLint + Prettier |
| Git | 中文提交信息规范（`commit-rules.md`）+ GitHub Flow |
| CI | GitHub Actions |
| 部署 | 腾讯云 Lighthouse/ECS + Docker Compose + Nginx + HTTPS |

## 3. 国内部署优先原则

- 线上主环境使用腾讯云 Lighthouse 或 ECS。
- 线上数据库使用腾讯云 PostgreSQL；本地使用 Docker PostgreSQL。
- 应用使用 Docker Compose 部署，Nginx 负责反向代理和 HTTPS。
- AI 默认使用 DeepSeek，保留 OpenAI-compatible 接口以便切换通义千问等模型。
- Vercel 只作为可选的国际预览环境，不作为主部署目标。
- 使用中国大陆地域和正式域名时，提前确认 ICP 备案要求；学习阶段可先使用香港地域完成部署验证。

## 4. 认证方案：Auth.js Credentials Provider

### 决策

使用 Auth.js Credentials Provider 完成登录；用户与账号数据通过 Prisma 持久化。

**会话策略固定为 JWT（不是数据库会话）。** 这是 Auth.js 的硬性约束——Credentials Provider 只支持 `session.strategy = "jwt"`，配成 database 策略会在运行时直接报错。因此：

- 登录态由 `AUTH_SECRET` 签名的 HttpOnly Cookie 承载，服务端通过 `auth()` 解出 `userId`。
- Prisma 的 `Session` 表**在 MVP 中不会被写入**，保留它是为了后续接入 OAuth 或实现「登出所有设备」时无需改 Schema。
- 取舍：JWT 会话无法在服务端单点强制失效（登出只清除本地 Cookie，已签发的 token 在有效期内仍可解出）。MVP 接受该限制。

**不接 PrismaAdapter。** 在「Credentials + JWT」组合下适配器不会被调用——它服务于 OAuth 账号绑定与邮箱类 Provider，而 MVP 两者都没开启。它的代价却很实在：`NextAuth({ adapter: PrismaAdapter(prisma) })` 会在模块加载期构造 Prisma Client、进而读取 `DATABASE_URL`，导致没有 `.env` 的构建环境（Docker 镜像 build 阶段、CI）整站构建失败。

因此：用户数据由 `actions/auth.ts` 直接读写 Prisma；`Account` 与 `Session` 两张表保留在 Schema 中，待接入 OAuth 时再启用适配器（届时需一并补 `VerificationToken`，依赖 `@auth/prisma-adapter` 已在 `package.json` 中预留）。

密码哈希使用 **bcryptjs**（纯 JS 实现），而非 `argon2` / `bcrypt` 原生绑定——原生模块在 Debian/Alpine 镜像里需要额外编译工具链，bcryptjs 可在 `node:22-slim` 上开箱运行，避免部署环境差异。

### 理由

- 与 Next.js App Router 集成自然。
- 不依赖国内访问不稳定的第三方 OAuth Provider。
- 能展示服务端会话校验、密码哈希、路由保护和数据库适配能力。
- 认证边界和授权逻辑可以由项目自身控制。

### 约束

- MVP 只实现邮箱加密码登录，并提供注册入口。
- 密码使用 bcrypt 哈希，禁止明文存储。
- MVP 不实现短信验证码；正式生产系统需要补充邮箱验证、找回密码和风控。
- 所有 Server Action 和 API Route 都必须校验当前 Session。
- 未登录用户不得访问 Dashboard 和 Workspace 数据。
- 自托管（Docker / 云服务器）必须设置 `AUTH_TRUST_HOST="true"`，否则 Auth.js 会拒绝非 localhost 的 Host。

## 5. 数据库方案：PostgreSQL + Prisma

### 决策

开发环境使用 Docker PostgreSQL，线上环境使用腾讯云 PostgreSQL，统一使用 Prisma 管理 Schema 和迁移。

### 理由

- 避免 SQLite 与 PostgreSQL 在类型、事务和约束上的行为差异。
- 便于部署到国内云数据库或其他 PostgreSQL 托管服务。
- Prisma Schema 可作为清晰的数据模型文档。
- 支持后续扩展 Workspace、Issue 和子任务关系。

### MVP 核心模型

- User
- Account
- Session
- Workspace
- WorkspaceMember
- Issue

### 关键数据约束

- Issue 必须属于 Workspace。
- WorkspaceMember 用于验证用户访问权限。
- Issue 状态使用枚举。
- 所有创建、读取、更新、删除操作必须带 Workspace 权限检查。

## 6. AI 方案：Vercel AI SDK + DeepSeek

### 决策

使用 Vercel AI SDK，连接 OpenAI-compatible API，默认 Provider 为 DeepSeek。模型地址和 API Key 通过环境变量配置。

### 理由

- 统一处理流式或非流式生成。
- 易于替换 OpenAI、DeepSeek 等兼容服务。
- 便于封装 Prompt、错误处理和 Token 统计。
- API Key 保留在服务端，不暴露给浏览器。

### AI 拆分结果格式

AI 必须返回经过 Schema 校验的结构：

```ts
type GeneratedSubtask = {
  title: string;
  description?: string;
};
```

AI 输出不符合 Schema 时：

1. 不写入数据库。
2. 向用户显示可理解的错误。
3. 允许重新生成或手动创建任务。

## 7. 目录结构：保留根目录 `app/`

> 以下为**决策时点**的结构草案。目录已随实现演进（如 `lib/` 新增领域模块、新增 `proxy.ts` 与根级错误边界），**现状以 `architecture.md` §5.1 为准**；`vue-comparison/` 属 P1 可选项，尚未创建。

```text
app/
├── (auth)/
├── (dashboard)/
├── api/
├── vue-comparison/
├── layout.tsx
└── globals.css

components/
├── ui/
├── board/
├── issue/
└── layout/

actions/
lib/
├── prisma.ts
├── auth.ts
├── ai.ts
├── validation.ts
└── errors.ts

hooks/
types/
tests/
docs/
```

保留当前仓库的根目录 `app/`，不进行无收益的 `src/` 迁移。

## 8. 状态管理：Server-first

MVP 优先使用 Server Components、Server Actions、URL Search Params 和 React 本地状态。暂不引入 Zustand，除非后续出现跨页面共享复杂客户端状态。

## 9. 部署方案：Docker Compose + 腾讯云

### 服务器组件

- Ubuntu 22.04 LTS
- Docker 和 Docker Compose
- Next.js Node.js 服务
- Nginx
- Certbot / Let's Encrypt
- 腾讯云 PostgreSQL

### 部署验证

- 服务器可通过 HTTPS 访问。
- 数据库迁移使用 `prisma migrate deploy`。
- 应用重启后数据不丢失。
- `.env` 只存在服务器，不进入 Git。
- 备份和恢复步骤已记录。

## 10. 不采用的方案

### SQLite

不作为正式数据库，仅允许临时本地实验，避免开发与生产环境行为不一致。

### Vercel 主部署

Vercel 可以作为可选的国际预览环境，但不作为国内部署主环境。

### 独立 FastAPI 服务

不纳入 MVP。只有在主项目稳定且面试目标明确时，才作为独立实验项目加入。
