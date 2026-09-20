# TaskFlow 文档中心

> 状态：生效  
> 版本：v1.3  
> 最后更新：2026-09-13

## 当前状态（2026-09-13）

当前产品方向正在从 Issue 任务看板切换为“多人写作平台”，第一阶段只做单人写作 MVP；原 TaskFlow 文档和代码保留为历史模块。技术方案以 Next.js 16.x（根目录 `app/`）、Auth.js Credentials + JWT、PostgreSQL + Prisma、Vercel AI SDK（默认 DeepSeek）、Tailwind CSS v4 + shadcn/ui、Docker Compose 和腾讯云部署为准。

原 TaskFlow 任务看板方向的 P0 第 0-4 梯队已完成并保留为历史模块；写作平台方向仍处于 ADR 和 MVP 规划阶段。架构评审的 P0 问题已在 2026-09-12 分两批整改（详见评审报告顶部状态横幅）。质量基线：Jest 11 个测试套件、31 个用例；冒烟脚本定义 40 项检查（环境自适应）；CI 执行 lint → format → prisma → build → Jest。Playwright 仅基础用例且未纳入 CI；Redis、迁移 Job、多实例发布仍待完成。未完成事项见 [P0 交付计划 §8-9](03-development/p0-delivery-plan.md) 与 [架构评审](02-architecture/architecture-review.md)。

## 阅读路径

**第一次了解本项目，按顺序读：**

1. [MVP 范围](01-product/mvp-scope.md) —— 做什么、不做什么、优先级
2. [User Stories](01-product/user-stories.md) —— 核心行为与验收标准
3. [技术决策 ADR-001](02-architecture/adr-001-technical-decisions.md) —— 技术选型及理由
4. [架构说明](02-architecture/architecture.md) —— 分层、数据流与安全设计

**参与开发，再读：**

5. [P0 交付计划](03-development/p0-delivery-plan.md) —— 逐项交付物、验收标准与执行状态
6. [API 契约](02-architecture/api-contracts.md)、[数据模型](02-architecture/data-model.md)、[测试策略](02-architecture/testing-strategy.md)
7. [开发语言规则](03-development/development-language-rules.md)、[提交规则](03-development/commit-rules.md)、[Definition of Done](03-development/definition-of-done.md)

**准备面试演示：**

8. [面试证据记录](04-interview/interview-evidence.md) —— 能力到代码/测试的映射
9. [运维手册](02-architecture/operations-runbook.md) —— 部署、回滚与恢复
10. [下一步开发计划与最终目标](03-development/next-steps-and-final-goals.md) —— 当前 Sprint、生产化门槛和最终交付标准

**做 UI 相关工作：**

11. [UI 设计系统 v2](05-design-assets/ui-design-system-v2.md)（现行规范）→ [ADR-006 组件库选型](02-architecture/adr-006-component-library.md) → [UI 质量审计](05-design-assets/ui-quality-audit.md)（问题清单，部分已修复）

## 文档目录

### 01-product · 产品与需求

| 文档 | 说明 | 状态 |
|---|---|---|
| [mvp-scope.md](01-product/mvp-scope.md) | 第一阶段单人写作 MVP 边界 | 提案，待确认 |
| [user-stories.md](01-product/user-stories.md) | 单人写作 MVP User Stories | 提案，待确认 |

### 02-architecture · 架构与决策

| 文档 | 说明 | 状态 |
|---|---|---|
| [adr-001-technical-decisions.md](02-architecture/adr-001-technical-decisions.md) | 技术栈、认证、数据库、AI、目录与部署决策 | 已接受 |
| [adr-007-writing-platform-direction.md](02-architecture/adr-007-writing-platform-direction.md) | 产品方向切换 ADR | 提案，待确认 |
| [adr-006-component-library.md](02-architecture/adr-006-component-library.md) | UI 组件库选型：shadcn/ui + Radix，备选 Base UI | 已接受，实施中 |
| [adr-index.md](02-architecture/adr-index.md) | ADR 索引与状态规则 | 生效 |
| [architecture.md](02-architecture/architecture.md) | 六层架构（L0-L5）、四条核心数据流、安全与状态约定 | 生效 |
| [architecture-diagram.html](02-architecture/architecture-diagram.html) | 可交互架构图（分层、依赖、数据流、部署） | 生效 |
| [api-contracts.md](02-architecture/api-contracts.md) | ActionResult 契约、限流、AI 接口与幂等语义 | 生效 |
| [data-model.md](02-architecture/data-model.md) | 六表模型、Issue 规则、迁移规则（Schema 为最终事实源） | 生效 |
| [document-data-model-proposal.md](02-architecture/document-data-model-proposal.md) | Document 数据模型提案 | 提案，待确认 |
| [testing-strategy.md](02-architecture/testing-strategy.md) | 测试分层、当前覆盖与通过门槛 | 执行中 |
| [observability.md](02-architecture/observability.md) | 结构化日志与健康检查的目标契约 | 规划中 |
| [operations-runbook.md](02-architecture/operations-runbook.md) | 腾讯云部署、发布回滚、备份恢复 | 执行中 |
| [security-threat-model.md](02-architecture/security-threat-model.md) | 资产、威胁与上线前安全门槛 | 规划中（上线门槛） |
| [architecture-review.md](02-architecture/architecture-review.md) | 2026-09-11 代码评审：25 项问题与修复批次 | 快照报告，部分已修复 |

### 03-development · 开发与交付

| 文档 | 说明 | 状态 |
|---|---|---|
| [development-roadmap.md](03-development/development-roadmap.md) | 阶段 1-7 学习与开发总路线、统一降级顺序 | 生效 |
| [next-steps-and-final-goals.md](03-development/next-steps-and-final-goals.md) | 当前 Sprint 5-8、生产化门槛与最终目标 | 生效 |
| [writing-platform-migration-plan.md](03-development/writing-platform-migration-plan.md) | 写作平台领域迁移顺序 | 规划中 |
| [p0-delivery-plan.md](03-development/p0-delivery-plan.md) | P0 逐项交付计划与执行状态（§8）、已知限制（§9） | 执行中 |
| [p0-5-move-issue-bulk-rewrite.md](03-development/p0-5-move-issue-bulk-rewrite.md) | 看板整列重写单条 SQL 的落地方案 | **已实施**，留档 |
| [sprint-plan.md](03-development/sprint-plan.md) | Solo Agile Sprint 0-4 节奏与降级规则 | 生效 |
| [definition-of-done.md](03-development/definition-of-done.md) | Story 完成门槛（八类检查项） | 生效 |
| [development-language-rules.md](03-development/development-language-rules.md) | TypeScript / React / CSS / 测试语言规范 | 生效 |
| [commit-rules.md](03-development/commit-rules.md) | 中文提交信息格式与暂存区纪律 | 生效 |

### 04-interview · 面试材料

| 文档 | 说明 | 状态 |
|---|---|---|
| [interview-evidence.md](04-interview/interview-evidence.md) | 能力证据模板（代码位置 / 验证方式 / 讲解要点） | 持续填充 |

### 05-design-assets · 设计资产

| 文档 | 说明 | 状态 |
|---|---|---|
| [ui-design-system-v2.md](05-design-assets/ui-design-system-v2.md) | 现行设计系统：三层令牌、信息架构、组件规范 | 生效（令牌与基础组件已落地，业务组件迁移中） |
| [ui-design-system-v2.html](05-design-assets/ui-design-system-v2.html) | 设计系统交互预览 | 已交付 |
| [ui-quality-audit.md](05-design-assets/ui-quality-audit.md) | 2026-09-11 UI 审计：评分与 P0-P2 问题清单 | 快照报告，部分已修复 |

### 归档与历史

| 文档 | 说明 | 归档原因 |
|---|---|---|
| [archive/develop-plan.md](archive/develop-plan.md) | 早期开发方案 | 技术选型与 ADR-001 矛盾，仅作演进参考 |
| [archive/ui-mockups.md](archive/ui-mockups.md) | UI 效果图文档 v1.0 | 已被 [ui-design-system-v2.md](05-design-assets/ui-design-system-v2.md) 替代 |
| [superpowers/plans/](superpowers/plans/) | 文档整理、shadcn 迁移两份执行计划 | 均已执行完毕，留档 |

> 评审与审计报告（architecture-review、ui-quality-audit、p0-5 方案）是**时点快照**：正文不随实现更新，修复进度以文档顶部的「状态更新」横幅为准。

## 文档质量门禁

- 每次文档变更必须检查所有相对 Markdown/HTML 链接是否存在。
- 核心文档顶部必须包含状态、版本和最后更新时间。
- 测试与冒烟数量以当前脚本和 Jest 输出为准，禁止手工估算。
- 快照报告必须注明快照日期，并以状态横幅解释当前实现。

## 维护规则

1. 新需求先更新 MVP 范围或 Backlog，再更新 Sprint 计划。
2. 技术选型变化必须新增或更新 ADR，并同步 `adr-index.md`。
3. User Story 变化必须同步验收标准和测试计划。
4. 部署变化必须同步架构文档、README 和面试证据。
5. UI 契约（令牌、组件、交互模式）变化必须同步 `ui-design-system-v2.md`（ADR-006 §7 要求，并纳入 DoD 检查）。
6. 文档移动后必须修复相对链接，并检查代码注释中的旧路径引用。
7. 文档变更不得混入无关代码、构建产物或密钥。
8. 快照类报告（评审/审计/方案）落地后在其顶部追加状态横幅，不改写正文结论。













