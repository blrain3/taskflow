# 写作平台重构实施计划

> 状态：规划中，等待 ADR-007 和 MVP 范围确认
> 版本：v1.0
> 最后更新：2026-09-13

**Goal:** 在保留现有认证和基础设施的前提下，新增 Document 领域并交付单人写作 MVP。

**Architecture:** 新功能使用独立的 `documents` 领域边界。页面通过 Server Components 读取，Server Actions/API Routes 负责鉴权、授权、校验和写入；自动保存与手动保存共享版本控制事务。旧 Issue 模块暂不删除。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript strict、Prisma/PostgreSQL、Auth.js、Jest、Playwright、Tailwind/shadcn/ui、Docker Compose。

**Spec:** `../02-architecture/adr-007-writing-platform-direction.md`、`../01-product/mvp-scope.md`、`../01-product/user-stories.md`、`../02-architecture/document-data-model-proposal.md`

## 全局约束

- 第一阶段只做单人写作 MVP，不实现实时协作。
- 禁止 WebSocket、SSE 实时同步、CRDT、OT、在线光标。
- 不删除 Issue 代码和历史文档。
- API Key 只能在服务端使用，真实 AI 调用不进入 CI。
- 每项改造必须有对应测试和独立提交，禁止混入无关文件。

## 推荐目录结构

```text
app/
  (dashboard)/documents/page.tsx             # 文档列表
  (dashboard)/documents/[documentId]/page.tsx # 编辑器与版本历史
  api/ai/outline/route.ts                    # AI 大纲
  api/ai/polish/route.ts                     # AI 润色
  api/ai/summary/route.ts                    # AI 摘要

actions/
  document.ts                                # 创建、保存、删除、恢复版本
  workspace-invite.ts                         # 邀请相关 Action（若现有模块不足）

components/document/
  DocumentList.tsx
  DocumentEditor.tsx
  AutoSaveIndicator.tsx
  VersionHistory.tsx
  AiWritingPanel.tsx

lib/
  documents.ts                               # Document 查询与事务写入
  document-versions.ts                       # 版本创建、列表和恢复
  document-permissions.ts                    # 文档操作权限
  ai-writing.ts                              # 大纲、润色、摘要 Provider 调用

types/
  document.ts
  document-ai.ts

tests/unit/
  document-validation.test.ts
  document-save.test.ts
  document-version.test.ts
  ai-writing.test.ts

tests/e2e/
  document-writing.spec.ts
```

目录名可以根据现有命名风格调整，但 Document 领域不得继续塞入 `lib/issues.ts` 或 `actions/issue.ts`。

## 下一步代码改造顺序

### 0. 方向确认与基线冻结

- [ ] 确认 ADR-007、MVP 范围、User Stories 和数据模型提案。
- [ ] 在新分支保存当前测试、Lint、TypeScript、Build 基线。
- [ ] 暂不修改 `prisma/schema.prisma`，先完成模型评审。

### 1. 数据模型与迁移

- [ ] 在 Prisma 中新增 Document、DocumentVersion、状态和内容格式枚举。
- [ ] 补充 Workspace/User 关系和索引。
- [ ] 编写迁移和回滚说明；不改 Issue 表。
- [ ] 运行 `prisma format`、`prisma validate`、迁移测试。

### 2. 文档权限与服务端领域层

- [ ] 新增 `lib/document-permissions.ts`，统一 read/edit/restore 权限判定。
- [ ] 新增 `lib/documents.ts`，封装列表、创建和保存事务。
- [ ] 实现 `baseVersion` 乐观并发检查，冲突返回统一 `CONFLICT`。
- [ ] 为越权、冲突、软删除和版本创建补 Jest。

### 3. 文档列表与编辑器

- [ ] 新增文档列表 Server Component。
- [ ] 新增编辑器 Client Component，第一阶段优先 Markdown。
- [ ] 新增创建、手动保存和删除入口。
- [ ] 覆盖空状态、加载、错误、未保存和保存成功状态。

### 4. 自动保存与版本历史

- [ ] 编辑器使用防抖触发保存，保留本地草稿直到服务端确认。
- [ ] 自动保存和手动保存复用同一 Action。
- [ ] 新增版本列表和恢复操作；恢复创建新版本，不修改历史记录。
- [ ] 增加过期版本冲突和失败重试测试。

### 5. AI 写作能力

- [ ] 抽取 `lib/ai-writing.ts`，复用现有 Provider、超时、重试、限流和错误脱敏。
- [ ] 先实现 AI 大纲，再实现润色，最后实现摘要。
- [ ] AI 结果先作为候选返回，用户确认后才写入 Document。
- [ ] Mock 覆盖成功、无效输出、超时、不可重试错误；真实 Key 只做服务端手工验证。

### 6. Playwright 与 CI

- [ ] 覆盖注册/登录 → 创建文档 → 编辑 → 自动保存 → 刷新恢复。
- [ ] 覆盖版本历史查看和恢复。
- [ ] 覆盖无权限访问和保存冲突提示。
- [ ] 稳定后纳入 CI；失败时阻断合并。

### 7. 国内部署与收尾

- [ ] 先完成腾讯云单实例部署、HTTPS、备份恢复和日志脱敏。
- [ ] 公网多实例前完成 Redis 限流、独立迁移 Job 和回滚演练。
- [ ] 更新 README、架构、ADR、运维手册和面试证据。
- [ ] 旧 Issue 模块保持可追溯，不在本阶段删除。

## 阶段验收门槛

每个阶段都必须通过相关 Jest/E2E、Lint、TypeScript 和 Build；阶段结束时更新文档状态和面试证据。任何实时协作需求直接进入第二阶段 Backlog。
