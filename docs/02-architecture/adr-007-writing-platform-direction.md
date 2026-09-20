# ADR-007：产品方向切换为多人写作平台

> 状态：提案，待确认
> 日期：2026-09-13
> 决策人：个人开发者
> 关联：`../01-product/mvp-scope.md`、`../01-product/user-stories.md`

## 1. 背景

当前 TaskFlow 以 Issue 看板、拖拽排序和 AI 任务拆解为核心。继续扩展会强化任务管理方向，与目标产品“多人写作平台”的文档编辑、版本历史和协作演进不一致。

## 2. 决策

产品方向切换为“多人写作平台”，但第一阶段只交付单人写作 MVP。认证、Workspace、成员权限、Prisma/PostgreSQL、AI Provider、Docker、CI 和测试体系继续复用；Issue 领域模型不再作为新功能基础，改为新增 Document 领域。

## 3. 为什么这样决策

- 保留成熟基础设施，降低认证、部署和质量体系的迁移成本。
- 以 Document/DocumentVersion 建立适合写作的持久化模型，避免把 Issue 字段硬套到文档。
- 先完成单人闭环，再验证编辑器、自动保存和版本恢复，控制实时协作的高复杂度风险。
- 实时同步、CRDT/OT、评论和发布需要独立的实时基础设施与产品设计，放入第二阶段。

## 4. 影响

### 保留

Auth.js Credentials + JWT、WorkspaceMember 权限、Prisma/PostgreSQL、服务端 AI 调用与错误映射、Docker/CI、Jest/Playwright 和现有运维文档。

### 新增

Document、DocumentVersion、文档 Action/Route、编辑器、自动保存、版本历史，以及大纲/润色/摘要 AI 用例。

### 标记为历史

Issue、看板拖拽、批量子任务创建和原任务拆解流程保留在代码与文档中，作为历史模块和回归参考，不继续向新 MVP 扩展。

## 5. 明确排除

第一阶段禁止 WebSocket、SSE 实时同步、CRDT、OT、在线光标、评论、审阅、分享发布和多人同时编辑冲突合并。

## 6. 备选方案

- 继续 TaskFlow：改造成本最低，但无法验证写作平台核心价值。
- 在原 Issue 上增加正文：短期快，但模型语义混乱、版本历史和权限边界难以维护。
- 新增 Document 领域并复用基础设施：迁移工作较大，但边界清晰、可持续演进，选择此方案。

## 7. 回滚策略

产品方向确认前只修改文档，不改生产 Schema。若方向取消，删除新增规划文档即可，原 TaskFlow 代码和文档不受影响。
