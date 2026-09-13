# UI Shadcn Migration Implementation Plan

**Goal:** 在保留现有 Tailwind v4 令牌和业务行为的前提下，引入 shadcn/ui 并逐层迁移 TaskFlow UI。

**Architecture:** shadcn 源码落在 `components/ui/`，只提供基础视觉与无障碍原语；业务状态和 Server Action 继续由现有 issue/auth 组件负责。先提交已有令牌与布局，再分基础组件、业务组件和主题收尾提交。

**Tech Stack:** Next.js 16、React 19、Tailwind CSS v4、shadcn/ui、Radix Primitives、TypeScript。

**Spec:** `docs/02-architecture/adr-006-component-library.md`

## Global Constraints

- 不提交 `docs/`、`.env`、Docker 和与 UI 迁移无关的用户改动。
- 不改变 Server Action、AI Route、拖拽状态机和数据契约。
- 组件颜色使用语义令牌，不恢复硬编码调色板。
- 每个批次运行 Jest、Lint、Prettier 和 TypeScript 检查。

### Task 1: UI Baseline

- 检查并提交当前 `globals.css`、布局、骨架屏改动。
- 提交信息：`优化 UI 令牌与页面布局`。

### Task 2: shadcn Foundation

- 安装 `class-variance-authority`、`clsx`、`tailwind-merge`、Radix Dialog 依赖。
- 创建 `components.json`、`lib/utils.ts` 和基础 Button/Input/Textarea/Label/Dialog/Skeleton/Badge。

### Task 3: Business Migration

- 将 IssueForm、AiBreakdownPanel、SubmitButton 和看板错误反馈迁移到基础组件。
- 保留原有业务状态、错误文案、Server Action 与 `<details>` 渐进增强路径。

### Task 4: Verification and Theme

- 运行全量质量检查。
- 浏览器可用时运行 Playwright。
- 业务组件迁移完成后切换最终 `data-theme` 值，并再次验证。
