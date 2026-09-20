> 状态：已归档
> 当前方案：请阅读 [MVP 范围](../01-product/mvp-scope.md)、[开发路线图](../03-development/development-roadmap.md) 和 [技术决策 ADR](../02-architecture/adr-001-technical-decisions.md)。

# TaskFlow 早期开发方案（历史）

以下内容保留用于了解方案演进，不作为当前执行依据。

TaskFlow 具体开发方案（敏捷 + 软件开发规范）
项目目标：基于现有的 Next.js 骨架，开发一个简化版 Linear 风格的 AI 任务协作平台（看板 + 列表 + AI 自动拆任务）。
周期建议：4 个 Sprint（共 4–5 周），个人开发适配（Solo Agile）。
技术规范
- 语言：TypeScript 严格模式
- 框架：Next.js 15 App Router + React 19
- 样式：Tailwind CSS + Shadcn/ui
- 状态：Zustand（客户端）+ Server Components / Server Actions
- 数据库：Prisma + PostgreSQL（开发可用 SQLite）
- 认证：NextAuth.js 或 Clerk
- AI：Vercel AI SDK 或直接调用 OpenAI / DeepSeek
- 测试：Jest + React Testing Library + Playwright（关键路径）
- 代码规范：ESLint + Prettier + Husky + lint-staged
- Git 规范：中文提交信息规范（`commit-rules.md`）+ GitHub Flow（main + feature 分支）
- CI/CD：GitHub Actions（lint → test → build → deploy to Vercel）
文档规范
- /docs 目录：PRD、架构图、API 文档、决策记录（ADR）
- 每个功能必须有对应的 User Story 和 Acceptance Criteria
- README 必须包含：本地启动、环境变量、架构说明、AI 使用记录
Definition of Done（完成标准）
- 功能符合 Acceptance Criteria
- 代码通过 lint 和测试
- 有基础单元测试 / E2E
- 有类型定义
- 已更新文档
- 通过 Code Review（自己用 AI 辅助 review 也可）
- 部署到预览环境可验证
Epic 1：基础架构与用户系统（高优先级）
- 用户注册 / 登录 / 登出
- 工作区（Workspace）创建
- 基础布局（侧边栏 + 顶部导航）
Epic 2：核心任务管理（Linear 风格）
- Issue / Task 的 CRUD
- 看板视图（拖拽）
- 列表视图
- 状态、优先级、标签、负责人
- 筛选、搜索、排序
Epic 3：AI 能力
- 自然语言创建任务并自动拆解
- AI 生成任务描述 / 周报
- AI 建议优先级
Epic 4：工程化与加分项
- Vue 对比模块（展示框架原理）
- 性能优化、暗黑模式、键盘快捷键
- 完整测试与文档
目标：把项目骨架变成“可长期维护的工程”
- 完善文件夹结构（参考：app/、components/、lib/、actions/、types/、hooks/）
- 配置 ESLint、Prettier、Husky、TypeScript strict
- 初始化 Prisma + 数据库 Schema（User、Workspace、Project、Issue）
- 配置 GitHub Actions 基础 CI
- 写初始 README 和架构文档（历史路径：`/docs/architecture.md`）
- 建立 Product Backlog（可用 Notion 或 GitHub Projects）
交付物：干净的可运行骨架 + 规范文档
目标：用户能登录并看到空看板
- 用户认证（注册、登录、Session）
- Workspace 创建与切换
- 基础布局（侧边栏、顶部栏）
- Issue 基础 CRUD（创建、编辑、删除、状态切换）
- 简单列表视图
User Stories 示例：
- 作为用户，我可以注册并登录，以便开始管理任务
- 作为用户，我可以创建 Issue 并设置标题、描述、状态
验收标准：能注册登录 → 创建几个任务 → 在列表中看到并修改状态
目标：实现真正好用的看板
- 看板视图（列：Backlog / Todo / In Progress / Done）
- 拖拽排序（推荐 @dnd-kit，同时理解原生事件机制）
- 优先级、标签、负责人筛选
- 搜索与快捷创建
- 乐观更新 + 加载状态
- 基础键盘快捷键（c 创建、/ 搜索等）
重点体现：DOM 事件、异步处理、React 性能优化（memo、虚拟列表可选）
目标：接入 AI，体现后端能力
- 自然语言输入 → AI 自动拆解成多个子任务
- AI 生成任务描述或周报总结
- Server Actions / API Route 处理 AI 调用
- 错误处理、限流、Token 统计（简单版）
- （可选）用 Python FastAPI 写一个独立 AI 服务，展示第二门后端语言
重点体现：异步编程、后端语言、Prompt 工程、AI Coding 工具使用记录
目标：达到可面试演示的质量
- Vue 3 Composition API 实现相同看板核心逻辑（对比页面）
- 写技术文档：《React vs Vue 响应式原理对比》《Next.js Server Components 实践》
- 暗黑模式、响应式、基础动画
- 单元测试 + 关键路径 E2E
- 性能优化（Lighthouse）
- 完善 README、演示视频、部署到 Vercel
- Retrospective：记录学到的经验与踩坑
```bash
src/
├── app/                    # Next.js App Router
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── api/
│   └── vue-comparison/     # Vue 对比模块
├── components/
│   ├── ui/                 # Shadcn
│   ├── board/
│   ├── issue/
│   └── layout/
├── actions/                # Server Actions
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   └── ai.ts
├── hooks/
├── stores/                 # Zustand
├── types/
└── docs/                   # 文档
```
1. 现在立刻做 Sprint 0：把规范和结构定好。
2. 用 AI Coding 工具（Cursor / Claude）时，强制要求它按你的规范生成代码，并记录关键 Prompt。
3. 每个 Sprint 结束都部署一次预览环境，方便自己验收。
