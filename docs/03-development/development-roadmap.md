# TaskFlow 分阶段开发计划

> 状态：生效
> 维护阶段：MVP / 部署 / 面试
> 关联文档：[文档中心](../README.md)、[P0 交付计划](p0-delivery-plan.md)、[Sprint 计划](sprint-plan.md)

## 1. 文档定位

本文档基于以下现有文档制定执行顺序：

- `mvp-scope.md`：定义 MVP 边界和 P0/P1/P2 优先级。
- `adr-001-technical-decisions.md`：固定技术选型和国内部署方案。
- `user-stories.md`：定义核心行为和 Given-When-Then 验收标准。
- `definition-of-done.md`：定义 Story 完成门槛。
- `sprint-plan.md`：定义 Solo Agile Sprint 节奏和降级规则。
- `development-language-rules.md`：定义 TypeScript、React、Next.js 和测试规范。
- `commit-rules.md`：定义提交范围和 Git 规则。
- `ui-design-system-v2.md`：提供页面视觉规范与设计令牌，不改变 MVP 功能边界（旧版 `ui-mockups.md` 已归档）。

执行优先级为：`MVP 范围 > ADR 技术决策 > User Story 验收标准 > DoD > UI 视觉细节`。

## 2. 总体目标

在 4-5 周、每周 30-40 小时投入下，完成一个可部署、可测试、可面试演示的 TaskFlow MVP：

> 登录 → Workspace → 创建 Issue → 列表查看 → 看板拖拽改状态 → AI 生成子任务 → 用户确认后批量创建

国内部署为主目标：

- 本地：Docker Compose + PostgreSQL。
- 线上：腾讯云 Lighthouse/ECS + Docker Compose + Nginx + HTTPS。
- AI：DeepSeek，使用 OpenAI-compatible 接口。

## 3. 阶段总览

| 阶段 | 时间 | 学习重点 | 主要结果 |
|---|---:|---|---|
| 阶段 1：环境与基线 | 1-2 天 | Next.js 16、TypeScript、Git、Docker | 可运行工程骨架 |
| 阶段 2：数据与认证 | 3-5 天 | PostgreSQL、Prisma、Auth.js、权限 | 登录和 Workspace |
| 阶段 3：Issue 垂直切片 | 4-6 天 | Server Action、表单、CRUD、测试 | 可持久化任务列表 |
| 阶段 4：核心看板 | 5-7 天 | React 状态、DOM 事件、拖拽、乐观更新 | 可用看板 |
| 阶段 5：AI 闭环 | 5-7 天 | 异步、Schema、错误处理、限流 | AI 子任务创建 |
| 阶段 6：国内部署 | 3-5 天 | Docker、Nginx、HTTPS、迁移、备份 | 腾讯云线上环境 |
| 阶段 7：面试化收尾 | 2-4 天 | 文档、性能、复盘、演示 | 可展示项目 |

阶段 1 对应 Sprint 0；阶段 2-3 对应 Sprint 1；阶段 4 对应 Sprint 2；阶段 5 对应 Sprint 3；阶段 6-7 对应 Sprint 4。

## 4. 阶段 1：环境与工程基线

### 目标

理解现有 Next.js 16.x 项目，建立符合规则的开发基础。

### 学习内容

- Next.js 16.x App Router 和根目录 `app/`。
- React Server Component 与 Client Component 边界。
- TypeScript strict、ESLint、Prettier。
- Git 分支、提交信息规范（`commit-rules.md`）和变更范围检查。
- Docker、Docker Compose 和环境变量。

### 开发任务

1. 确认当前仓库版本，不迁移到 `src/`。
2. 配置 TypeScript strict、ESLint、Prettier。
3. 建立 `components/`、`actions/`、`lib/`、`types/`、`tests/` 目录。
4. 创建 `.env.example`，不得写入真实密钥。
5. 创建 Dockerfile 和本地 PostgreSQL 的 Docker Compose 配置。
6. 配置 GitHub Actions：lint、test、build。
7. 更新 README，写明中国环境下的安装、启动和环境变量。

### 出口条件

- `npm run lint` 通过。
- `npm run build` 通过。
- `docker compose up -d` 可以启动 PostgreSQL。
- 数据库连接失败时有明确提示。
- CI 能执行 lint 和 build。
- 变更符合提交规则，不包含无关文件。

### 不做

- 不实现业务功能。
- 不引入 Zustand。
- 不迁移目录结构。
- 不同时配置 Vercel 和腾讯云两套主部署流程。

## 5. 阶段 2：数据模型与认证

### 目标

建立安全的数据基础和登录流程。

### 学习内容

- PostgreSQL 表、关系、索引和迁移。
- Prisma Schema、Client 和 `migrate deploy`。
- Auth.js Credentials Provider。
- 密码哈希、Session、认证和授权的区别。
- Workspace 数据隔离。

### 开发任务

1. 建立 `User`、`Account`、`Session`、`Workspace`、`WorkspaceMember`、`Issue` 模型。
2. 完成 Prisma migration。
3. 使用 Argon2 或 bcrypt 保存密码哈希。
4. 实现注册、登录、登出。
5. 保护 Dashboard 路由。
6. 首次登录时创建或引导创建 Workspace。
7. 编写未登录和跨 Workspace 访问测试。

### 出口条件

- 有效用户可以登录和登出。
- 未登录用户不能访问 Dashboard。
- 用户只能访问属于自己的 Workspace。
- 密码不以明文存储。
- migration 可以重复执行。
- US-001、US-002 的验收标准通过。

### 风险控制

- 不实现短信验证码。
- 不引入 GitHub OAuth 作为主登录方式。
- 认证失败不得泄露内部错误细节。

## 6. 阶段 3：Issue 垂直切片

### 目标

完成第一条真正可用的业务闭环：登录后创建并查看任务。

### 学习内容

- Server Components 数据读取。
- Server Actions 数据变更。
- 表单校验和服务端 Schema 校验。
- CRUD、错误处理和加载状态。
- React Testing Library 的行为测试。

### 开发任务

1. 实现 Issue 创建、编辑、删除和状态切换。
2. 状态固定为 `BACKLOG`、`TODO`、`IN_PROGRESS`、`DONE`。
3. 实现列表视图、空状态和加载状态。
4. 标题设置非空和最大长度校验。
5. 所有 Action 执行 Session 和 Workspace 权限检查。
6. 防止重复提交。
7. 为 CRUD 和权限边界增加单元测试。
8. 完成登录 → 创建 Issue → 修改状态的 Playwright E2E。

### 出口条件

- US-003、US-004、US-005 的验收标准通过。
- 刷新页面后数据仍然存在。
- 创建、编辑、删除失败时 UI 状态正确。
- `npm run lint`、`npm run build` 和相关测试通过。
- 预览环境可以演示该流程。

### 阶段增量

用户可以登录、创建任务、查看任务、修改任务和删除任务。

## 7. 阶段 4：核心看板

### 目标

实现列表与看板之间的核心任务管理体验。

### 学习内容

- Client Component 的必要边界。
- DOM 事件、事件冒泡、`preventDefault`。
- `@dnd-kit` 的拖拽模型。
- 乐观更新、失败回滚和异步竞态。
- React 渲染和稳定 `key`。

### 开发任务

1. 实现四列看板。
2. 使用 `@dnd-kit` 拖拽 Issue。
3. 拖拽时先更新 UI，再调用服务端 Action。
4. 服务端失败时恢复原状态。
5. 处理无效拖拽、空列和加载状态。
6. 列表和看板通过 URL 参数切换。
7. 记录原生 DOM 事件与拖拽库的关系。
8. 增加拖拽成功和失败回滚测试。

### 出口条件

- US-006 的验收标准通过。
- 拖拽状态刷新后仍然正确。
- 请求失败不会留下虚假 UI 状态。
- 看板 E2E 通过。
- 目标桌面分辨率没有布局重叠。

### 降级顺序

先不做搜索、筛选、标签、负责人、动画和虚拟列表。

## 8. 阶段 5：AI 任务拆分闭环

### 目标

只实现一个稳定 AI 能力：自然语言输入转为可确认的结构化子任务。

### 学习内容

- Server-side AI API 调用。
- DeepSeek OpenAI-compatible 接口。
- Prompt 设计和结构化输出。
- Schema 校验、超时、重试、限流。
- 批量写入和事务。
- API Key 与客户端边界。

### 开发任务

1. 配置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。
2. 在 `lib/ai.ts` 封装模型调用。
3. 输入自然语言，要求输出子任务数组。
4. 使用 Schema 校验 AI 结果。
5. 展示、编辑、删除和确认子任务。
6. 用户确认后批量创建 Issue。
7. 增加超时、重试、失败和重复提交防护。
8. 记录请求次数或 Token 统计。
9. Mock AI Provider，测试成功、超时和无效输出。

### 出口条件

- US-007、US-008 的验收标准通过。
- API Key 不进入客户端。
- 无效 AI 输出不会写入数据库。
- 批量写入失败时不会产生不可追踪的部分数据。
- DeepSeek 请求失败时有重试或人工兜底。
- AI Coding 记录已补充到 `interview-evidence.md`。

### 明确不做

- AI 周报。
- AI 优先级推荐。
- 多模型路由。
- 独立 FastAPI 服务。

## 9. 阶段 6：国内线上部署

### 目标

让 MVP 在国内云服务器上可访问、可迁移、可恢复。

### 学习内容

- 腾讯云 Lighthouse/ECS 基础运维。
- Ubuntu 22.04、SSH 和安全组。
- Docker Compose 生产配置。
- Nginx 反向代理。
- HTTPS 和 Certbot。
- PostgreSQL 备份、恢复和迁移。
- 日志和基础监控。

### 开发任务

1. 购买或准备腾讯云 Lighthouse/ECS。
2. 安装 Docker、Docker Compose、Nginx 和 Certbot。
3. 配置生产 `.env`，只保存在服务器。
4. 配置腾讯云 PostgreSQL。
5. 执行 `prisma migrate deploy`。
6. 使用 Docker Compose 启动 Next.js。
7. 配置 Nginx 反向代理和 HTTPS。
8. 验证应用重启后数据保持。
9. 编写数据库备份和恢复步骤。
10. 更新部署证据和 README。

### 出口条件

- 国内 HTTPS 地址可以访问。
- 登录、Issue、看板和 AI 流程在线可用。
- 服务器重启后应用自动恢复。
- 数据库迁移成功且无数据丢失。
- 备份和恢复至少演练一次。
- `.env`、密钥和日志中的敏感信息未进入 Git。

### 注意事项

- 使用中国大陆地域和正式域名时，确认 ICP 备案。
- 学习阶段可先使用香港地域、公网 IP 或临时域名完成验证。
- 不把云服务器口令、API Key 或证书私钥写入仓库。

## 10. 阶段 7：面试化收尾

### 目标

把已完成的 MVP 变成容易演示和讲解的作品。

### 开发任务

1. 完善 README：启动、环境变量、架构、测试和部署。
2. 更新 ADR、架构图和数据流说明。
3. 填写 `interview-evidence.md` 的代码位置和测试证据。
4. 编写 React vs Vue 响应式原理对比文档。
5. 只有时间充足时实现 Vue 对比看板。
6. 修复高优先级响应式和可访问性问题。
7. 建立 Lighthouse 基线并做高收益优化。
8. 录制不超过 5 分钟的演示视频。
9. 完成 Retrospective，记录缺陷、取舍和后续 Backlog。

### 出口条件

- 完整演示流程不超过 5 分钟。
- P0 缺陷全部关闭或有明确记录。
- DoD 全部满足。
- 国内部署地址、截图、测试结果和架构说明齐全。
- P1/P2 项目明确保留在 Backlog，不影响 MVP 发布。

## 11. 每个阶段的固定工作循环

### 开始前

- 从对应阶段选择 3-5 个 Story。
- 确认入口条件。
- 阅读对应 User Story 和 DoD。
- 标记外部依赖和风险。

### 开发中

- 每日 10 分钟记录完成项、阻塞项和下一步。
- 先写或补充验收测试，再实现功能。
- 每次提交前只暂存当前任务文件。
- 不使用 `git add .`，不提交 `docs/` 中无关文件或其他临时文件。

### 结束时

- 按 Given-When-Then 验收。
- 执行 lint、test、build。
- 部署预览或线上版本。
- 更新文档和面试证据。
- 记录未完成事项和下一阶段调整。

## 12. 进度落后时的统一降级顺序

1. 移除 Vue 对比模块。
2. 移除动画、暗黑模式和仪表盘。
3. 移除搜索和筛选。
4. Token 统计只保留服务端记录。
5. AI 只保留任务拆分和确认创建。
6. 暂缓 FastAPI、周报和 AI 优先级推荐。
7. 不降低认证、权限、核心测试、数据库迁移和国内部署质量。
