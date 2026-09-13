# TaskFlow 测试策略

> 状态：执行中
> 维护阶段：MVP
> 关联文档：[Definition of Done](../03-development/definition-of-done.md)、[P0 交付计划](../03-development/p0-delivery-plan.md)、[架构评审](architecture-review.md) §4 P1-6

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.3 |
| 最后更新 | 2026-09-12 |
| 文档状态 | 执行中（与当前工具链同步） |

## 1. 当前状态

质量命令（均已存在且可执行）：

| 命令 | 内容 | 位置 |
|---|---|---|
| `npm run lint` | ESLint（含依赖方向护栏） | `eslint.config.mjs` |
| `npm run format:check` | Prettier 检查 | `.prettierrc.json` |
| `npm run build` | Next.js 生产构建 | — |
| `npm test` | Jest 单元测试（`--runInBand`） | `jest.config.cjs`、`tests/unit/` |
| `npm run test:e2e` | Playwright E2E | `playwright.config.ts`、`tests/e2e/` |
| `npm run smoke` | HTTP 层冒烟（40 项检查，环境自适应） | `scripts/smoke.mjs` |

工具接入现状：

- **Jest：已接入。** `tests/unit/` 现有 11 个套件、31 个用例，全部通过（2026-09-12）。覆盖：`validation`、`errors`、`rate-limit`、`client-ip`、`ai`（解析器）、`ai-route`、`auth-register`（并发冲突映射）、`auth-rate-limit`（认证限流共享逻辑）、`issue-batch`（批量创建幂等与 position 分配）、`db-errors`、`move-issue-sql`（整列重写 SQL 构造）。
- **Playwright：已接入。** `tests/e2e/smoke.spec.ts` 目前含基础用例（健康检查、未登录重定向）。E2E 尚未纳入 CI。
- **React Testing Library：未接入。** 组件级行为测试暂缺，登记为已知缺口。
- **CI 实际执行**：`npm ci` → Prisma generate/validate → Prettier → ESLint → build → **单元测试**。E2E 待用例扩充后加入。
- **冒烟脚本**（40 项）新增「REST 凭据回调无法绕开邮箱失败计数」回归断言；依赖 IP 维度的用例（换 IP 不锁号、注册限流）在「生产模式且未信任代理」的目标上自动跳过，可用 `SMOKE_EXPECT_IP_RATE_LIMIT=true` 强制开启。

覆盖缺口（优先级从高到低）：

1. **领域层 Action 级测试**：`lib/issues.ts`（除 SQL 构造外）、`lib/permissions.ts`、`actions/*` 仍无测试（架构评审 P1-6 剩余部分）。
2. **拖拽交互**：拖拽反馈、乐观更新与失败回滚依赖浏览器 JS 事件，冒烟只能覆盖看板 SSR。
3. **AI 面板点击链路与批量创建幂等的端到端验证**：幂等服务端逻辑已有 Jest 覆盖（`issue-batch`），按钮链路仍需 Playwright。
4. **组件行为测试**：待 RTL 接入后补表单错误、pending、空态、重试。

## 2. 测试分层

| 层级 | 目标 | 必测内容 | 现状 |
|---|---|---|---|
| 单元测试 | 纯函数和领域规则 | Schema、错误映射、限流、SQL 构造、权限判定 | ✅ 已接入（纯函数层） |
| 集成测试 | Action 与数据库边界 | CRUD、越权、事务回滚、重复提交 | ⚠️ 部分由冒烟覆盖，Action 级 Jest 测试待补 |
| 组件测试 | 用户行为 | 表单错误、pending、空态、错误重试 | ❌ RTL 未接入 |
| E2E | 关键业务闭环 | 登录 → 创建 Issue → 看板移动 → AI 确认创建 | ⚠️ 已接入，仅基础用例 |
| 冒烟（HTTP） | 服务端契约与 SSR | 健康、认证、权限、CRUD、看板 SSR、AI 契约、限流覆盖 | ✅ 40 项（环境自适应） |

## 3. 外部依赖测试

- AI Provider 必须 Mock（`AI_PROVIDER=mock`），不在 CI 调用真实模型。
- 测试 AI 成功、超时、限流、条数不足和无效 Schema 输出（冒烟已覆盖这些分支）。
- 数据库测试使用隔离数据库或测试 Schema，禁止污染生产数据。
- E2E 使用专用测试账号和可重复的初始化数据。

## 4. 通过门槛

- 任何 P0 Story 必须有至少一个正常路径和一个异常路径测试。
- 缺陷修复必须增加回归测试。
- `lint`、`format:check`、`build`、`npm test` 全部通过后才可交付；E2E 用例扩充后逐步纳入 CI 门禁。
- 组件测试（RTL）接入前，涉及 UI 行为的 Story 必须在交付记录中登记该缺口，不得声称组件行为已自动化验证。
- 冒烟通过是每次容器化验证的最低要求（`docker compose up -d` 后运行 `npm run smoke`）。

## 5. 下一步

1. 补 `lib/issues.ts` / `lib/permissions.ts` / `actions/*` 的 Jest 测试（`jest.mock("@/lib/prisma")` 注入，断言查询形状与分支结果）——评审 P1-6，优先级最高。
2. 扩充 Playwright 用例：注册/登录表单提交、看板拖拽（含失败回滚）、AI 面板确认创建（含重复点击幂等）。
3. 用例稳定后将 `npm run test:e2e` 加入 CI。
4. 评估接入 RTL 与 `@axe-core/playwright`（无障碍断言，对应 UI 审计 §7.2）。

