# TaskFlow ADR 索引

| 编号 | 决策 | 状态 | 说明 |
|---|---|---|---|
| ADR-001 | MVP 技术栈、认证、数据库、AI、目录和部署 | 已接受 | [查看 ADR-001](adr-001-technical-decisions.md) |
| ADR-002 | JWT 会话策略 | 已接受 | 已记录于 ADR-001 §4；后续可拆分 |
| ADR-003 | AI 生成与批量写库解耦 | 已接受 | 已记录于 `architecture.md` §6/§8；后续可拆分 |
| ADR-004 | Issue `position` 完整顺序重写 | 已接受 | 已记录于 `architecture.md` §8.3 与 `p0-5-move-issue-bulk-rewrite.md`（已实施为单条 SQL）；后续可拆分 |
| ADR-005 | 腾讯云 + Docker Compose + Nginx 部署 | 已接受 | 已记录于 ADR-001 §9 与 `operations-runbook.md`；后续可拆分 |
| ADR-006 | UI 组件库选型（shadcn/ui + Radix，备选 Base UI） | 已接受，基础组件已迁移 | [查看 ADR-006](adr-006-component-library.md)；依据 `../05-design-assets/ui-quality-audit.md`。令牌层与基础组件已落地，业务组件迁移进行中 |
| ADR-007 | 产品方向切换为多人写作平台（第一阶段单人写作 MVP） | 提案，待确认 | [查看 ADR-007](adr-007-writing-platform-direction.md) |

## 决策状态规则

- `提议`：尚未批准，不作为实现依据。
- `已接受`：当前生效。
- `已废弃`：保留历史记录，不得用于新代码。
- `已替代`：由新的 ADR 取代，必须链接替代编号。

新增架构决策时，先在此索引登记，再创建独立 ADR 或补充现有 ADR。



