# TaskFlow 架构评审报告

> 评审对象：2026-09-11 工作区快照（第 0–4 梯队已落地，冒烟 29/29 通过）
> 评审范围：模块划分、分层结构、依赖关系、可扩展性、可维护性、性能、安全边界
> 关联文档：`architecture.md`、`data-model.md`、`security-threat-model.md`、`observability.md`、`testing-strategy.md`、`../03-development/p0-delivery-plan.md` §9

> **状态更新（2026-09-12 · 第二批整改后）**：本报告为时点快照，正文结论不随后续修复改写。当前修复状态：
>
> **已修复（第二批，对应提交 `cc1bfbc` ~ `3ff7a96`）**：
> P0-1（批量创建拆至 `lib/issue-batch.ts`）、P0-2（幂等主键加 workspaceId 前缀）、P0-3（新增 `proxy.ts`）、
> P1-1（校验常量统一引用）、P1-7（根级错误边界 + `next.config.ts` 安全响应头）、
> P2-1（AI 面板请求可取消）、P2-2（候选列表稳定 `clientId`）、P2-3（position 接在列内最大值之后）、P2-8（目录树已同步）、P2-10（`.gitkeep` 已清理）。
>
> **部分修复**：P0-4（`listIssues` 加 500 条硬上限，分页与「加载更多」待做）、P1-5（补 `lib→actions`、`lib→app`、`actions→app` 反向边；`components→lib` 的非 prisma 导入**有意保留**——类型与常量共享是允许的方向）、P1-6（Jest 11 套件 31 用例，含 `issue-batch` 与认证限流；`lib/issues`/`lib/permissions`/`actions` 主体仍待覆盖）。
>
> **第一批已修复**：P0-5（整列重写单条 SQL，见 `../03-development/p0-5-move-issue-bulk-rewrite.md`）、P1-2（注册 TOCTOU → `CONFLICT`）。
>
> **报告之外的新发现（同批修复）**：登录限流可经 REST 凭据回调完全绕过；生产未信任代理时 IP 限流桶退化为全局桶（全站锁死开关）；注册邮箱计时枚举侧信道；AI 超时误报为 502。
>
> **仍未修复**：P1-3（四步契约复制粘贴）、P1-4（缓存语义二选一）、P1-8（`role` 裸 String）、P1-9（所有权双重表达）、P2-4（`toActionError` 内联日志）、P2-5（限流 FIFO 淘汰）、P2-6（未使用依赖，ADR-001 已声明预留）、P2-7（写路径隐式建工作区）、P2-9（无 Suspense 分段）、P2-11（AI 输出贪婪正则）。修复批次建议见 §6。

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.0 |
| 评审日期 | 2026-09-11 |
| 结论 | 分层与契约执行度高，主要问题集中在「越界写库」「全量查询」「事务内 N+1」「护栏覆盖不全」四类 |
| 问题总数 | 25（P0 5 / P1 9 / P2 11） |

---

## 1. 评审结论摘要

这套代码的架构执行度明显高于同类个人项目：统一返回契约、单一校验真源、惰性 env、幂等批量创建、乐观更新的三类同步暂停、以及把依赖方向写成 ESLint 规则，都是「架构真的在起作用」的证据。因此本报告刻意**不重复** `p0-delivery-plan.md` §9 已承认的限制（内存限流、IP 头可伪造、登录锁窗、客户端幂等键、Jest/Playwright 被阻塞、镜像体积），只列**尚未被记录的问题**。

按主题归类：

| 主题 | 问题数 | 代表问题 |
|---|---:|---|
| 分层与职责边界 | 3 | `lib/ai.ts` 越界写库；四步契约靠复制粘贴 |
| 数据隔离与安全 | 3 | 幂等键派生主键造成跨 Workspace 存在性探测；无 `proxy.ts`；无安全响应头 |
| 性能与可扩展性 | 4 | 全量 `findMany`；事务内 N+1 UPDATE；无 Suspense 分段 |
| 一致性（单一真源） | 4 | 长度上限硬编码绕过常量；`role` 裸 String；所有权双重表达 |
| 可测试性 | 2 | 领域层（`lib/issues`、`lib/permissions`、`lib/ai`）零覆盖 |
| 可维护性 / 卫生 | 6 | ESLint 护栏只覆盖部分反向边；缓存语义混乱；文档漂移 |
| 健壮性 | 3 | 注册 TOCTOU；AI 输出贪婪正则；批量创建 position 撞号 |

**如果不做任何修复，最先出问题的是 P0-5**（大列拖拽在 5s 事务超时下失败，用户看到「拖了又弹回去」）**和 P0-4**（任务数上千后首屏线性变慢）。

---

## 2. 评审方法与依据

- 通读全部源码：`app/`（16 文件）、`components/`（11）、`lib/`（12）、`actions/`（2）、`hooks/`（1）、`types/`（3）、`prisma/`、`tests/`（6）、工程配置（`eslint.config.mjs`、`jest.config.cjs`、`next.config.ts`、`Dockerfile`、`docker-compose.yml`）。
- 逐项核对实现与文档声明是否一致（`architecture.md` §4/§6/§7.2、`ui-mockups.md` §2.5、`adr-001`）。
- 区分三类：**契约破坏**（实现违反自己写下的规则）、**能力缺口**（承诺未实现）、**结构缺陷**（能跑但会随规模/人数恶化）。
- 该快照未做运行时验证，性能类结论均为代码推断（已在各条注明验证方式）。

---

## 3. P0 · 生产前必须修复

### P0-1 `lib/ai.ts` 越界写库，违反自己写下的分层契约

**现象与证据**

`docs/02-architecture/architecture.md` §6 明确写：「`lib/ai.ts` 只负责得到并校验子任务，**不写库**；写库由 `actions/issue.ts` 的批量创建负责。这样 AI 失败时天然不会污染数据。」

但实现是反的：`lib/ai.ts:245` 的 `createIssuesFromSubtasks()` 直接 `getPrisma().$transaction(...)` 落库，整个批量创建用例（含幂等、P2002 处理、事务）都住在 AI 模块里。`actions/issue.ts:18` 因此需要 `import { createIssuesFromSubtasks } from "@/lib/ai"` —— 一个与 AI 无关的持久化操作，却要经由 AI 模块的入口。

**为什么是问题**

- 一个模块背了两个变化原因：换模型/改 Prompt 和改批量创建策略，都要动 `lib/ai.ts`。
- 单测 `lib/ai.ts` 时，既要造 AI provider mock，又要造 Prisma mock；而它本该是纯的。
- 文档与实现的边界声明失效后，后续维护者会照着文档找「批量创建在哪」，找不到。

**改进方向**

1. 抽出 `lib/issue-batch.ts`，承载 `createIssuesFromSubtasks()` 及其幂等逻辑；`lib/ai.ts` 只保留 `breakdownSubtasks()` / `parseAndValidateSubtasks()`。
2. `actions/issue.ts` 改从 `@/lib/issue-batch` 引入。
3. 在 `lib/ai.ts` 顶部加一条 ESLint 或注释级约束：「本文件禁止引入 `getPrisma`」，把规则写死。

**验证方式**

`grep -n "getPrisma" lib/ai.ts` 应为空；`lib/ai.ts` 的单元测试不再需要 mock Prisma。

---

### P0-2 幂等键派生主键，造成跨 Workspace 存在性探测

**现象与证据**

`lib/validation.ts:152` 的 `requestIdSchema` 由**客户端**生成；`lib/ai.ts:250` 用它拼出主键：

```ts
const ids = params.subtasks.map((_, index) => `${params.requestId}:${index}`);
```

而 `lib/ai.ts:294` 在撞上 P2002 时返回 `CONFLICT("该批次标识已被占用，请重新生成子任务")`。

**为什么是问题**

`lib/issues.ts:11` 写下了这个项目的核心安全铁律：

> 跨 Workspace 的操作不区分「不存在」与「无权限」，统一返回 `NOT_FOUND`，避免通过错误码探测他人数据是否存在。

而现在存在一个可区分的响应通道：**同一个 ID，在别处已存在 → CONFLICT；不存在 → 创建成功**。由于 ID 的形状完全由客户端决定，只要拿到（或猜到）他人某批次的 `requestId` 前缀，就能探测该批次是否存在。严重度不高（需要先泄漏 requestId），但它是「客户端决定主键」这一做法的直接后果，且明确破坏了已写下的契约。

**改进方向**

主键加上 Workspace 维度，冲突在结构上不可能发生：

```ts
const ids = params.subtasks.map((_, i) => `${params.workspaceId}:${params.requestId}:${i}`);
```

附带三个好处：① P2002 分支可以删掉，CONFLICT 语义退回统一 `NOT_FOUND`；② 由 ID 前缀即可反查归属，便于排障；③ 跨 Workspace 重放彻底失效。

**验证方式**

新增用例：同一 `requestId` 在两个 Workspace 各提交一次，双方都成功、且互不可见（当前实现下第二次会拿到 CONFLICT）。

---

### P0-3 缺少 `proxy.ts`，路由保护完全依赖开发者记忆

**现象与证据**

仓库中不存在 `proxy.ts` / `middleware.ts`（Next.js 16 已将 `middleware` 更名为 `proxy`）。保护只来自两处显式调用：

- `app/(dashboard)/layout.tsx:17` → `requireWorkspaceContext()`
- `app/(dashboard)/issues/page.tsx:24` → 再次 `requireWorkspaceContext()`

`lib/auth.ts:103` 的注释已经说清了原因：布局在客户端导航时不重新执行，所以每个受保护页面都必须自己校验。

**为什么是问题**

这是一条「每新增一个受保护页面都必须记得加一行」的约定，靠记忆维持。当前只有一个受保护页面，所以没有暴露；一旦加到 5 个页面，漏掉的那一个就会在未登录状态下先执行 RSC 查询再跳转 —— 数据不会出圈（查询仍带 `workspaceId`），但会白跑查询，且可能触发 `ensureWorkspaceForUser` 的隐式建工作区副作用。

**改进方向**

加 `proxy.ts` 做粗粒度拦截（`auth()` 判空即 `redirect("/login")`），把「必须登录」变成框架层保证；页面内的 `requireWorkspaceContext()` 保留为纵深防御（它还要解析 workspace，职责不同）。

**验证方式**

未登录访问任意受保护路径，应在 proxy 层被 302，而不是进入 RSC 渲染。

---

### P0-4 `listIssues` 全量返回，看板把整个工作区一次拉进内存

**现象与证据**

`lib/issues.ts:66`：

```ts
const rows = await getPrisma().issue.findMany({ where: { workspaceId }, orderBy: ..., select: ... });
```

**没有 `take`、没有 `cursor`**。而 `components/board/Board.tsx:171` 按四列全量渲染，无虚拟化。

**为什么是问题**

单工作区任务数从数百涨到数千时，以下四项同时线性膨胀：数据库返回行数、RSC 序列化体积、客户端 DOM 节点数、`moveIssue` 的整列重写代价。这是当前最直接的可扩展性天花板，且属于「越晚改越贵」的类型（分页会改变 UI 语义，早做成本低）。

**改进方向**

1. `listIssues` 增加 `take` 上限 + cursor 分页；列表视图直接复用。
2. 看板每列独立 `take`（如 50），列尾提供「加载更多」。
3. 若暂时不想改 UI：先给一个硬上限（如 500）并在超出时给出提示，作为过渡，成本极低。

**验证方式**

造 2000 条任务，对比改造前后首屏 HTML 体积与 TTFB。

---

### P0-5 拖拽落库在事务内串行 N+1 UPDATE，且存在 5s 事务超时

**现象与证据**

`lib/issues.ts:193-198`：

```ts
for (let index = 0; index < fullOrder.length; index += 1) {
  await tx.issue.update({ where: { id: fullOrder[index] }, data: { position: index * 100 } });
}
```

列长度上限由 `lib/validation.ts:105` 定为 500。

**为什么是问题**

一列 500 张卡 = 500 条**串行** UPDATE，全部在一个交互式事务里持有。Prisma 交互式事务默认超时 5 秒，大列下会直接超时失败。失败的后果不是普通报错：客户端 `hooks/useBoardMove.ts:73` 会回滚到拖拽前快照并弹出「已恢复拖动前的位置」——用户看到「拖了又弹回去」，而且重试大概率再次失败。这是本报告中唯一「在正常使用下（不是极端攻击）就会发生」的 P0。

**改进方向**（按推荐度）

1. **单条 SQL 重写整列**：`UPDATE issues SET position = CASE id WHEN ... END WHERE workspace_id = ...`，用 `$executeRaw` 一次完成，往返次数从 N 降到 1。
2. **改稀疏排序键**：只写被移动的那一张卡（取前后邻居中点，或改用 fractional indexing 字符串键），彻底消除整列重写。
3. **过渡方案**：先分批 + `$transaction(fn, { timeout: 15000 })` 拉高超时，把失败率压下去，同时排期做 1 或 2。

**验证方式**

一列塞满 500 张卡，测 `moveIssue` 的 P95 耗时；当前实现预计接近或超过 5 秒。

---

## 4. P1 · 应尽快修复

### P1-1 校验常量有单一真源，组件却把数字硬编码

- **证据**：`lib/validation.ts:57-58` 导出了 `ISSUE_TITLE_MAX_LENGTH`、`ISSUE_DESCRIPTION_MAX_LENGTH`；但 `components/issue/IssueForm.tsx:34,49`、`IssueRow.tsx:86,104`、`AiBreakdownPanel.tsx:170,241,254` 共 7 处写死 `200` / `2000` / `4000`。
- **影响**：改一次上限要动 4 个文件 7 处；漏改一处就出现「前端允许提交、服务端拒绝」或反之。这直接违背了项目自己主张的「唯一校验真源」。
- **改进**：组件改为 `import { ISSUE_TITLE_MAX_LENGTH, ... } from "@/lib/validation"`；并把 `PROMPT_MAX_LENGTH` / `MIN_PROMPT_LENGTH` 一并提到 `lib/validation.ts`（`components/` 引入 `lib/` 的纯常量不违反分层，`lib/validation.ts` 不读 env、不导入 server-only）。
- **验证**：`grep -rn "maxLength={200" components/` 应为空。

### P1-2 注册是 TOCTOU，并发下返回 500 而非 409

- **证据**：`actions/auth.ts:139-150` 先 `findUnique` 判重、再 `create`。并发同邮箱注册时，后者撞 P2002，被 `toActionError` 收敛为 `INTERNAL`。
- **影响**：用户看到「服务暂时不可用」而不是「该邮箱已注册」；错误码语义错位，也会污染监控里的 5xx 指标。
- **改进**：删掉 `findUnique`，直接 `create` 并在 catch 里判 `code === "P2002"` → `CONFLICT`。`lib/permissions.ts:47` 已有同款 `isUniqueViolation()`，抽到 `lib/prisma-errors.ts` 两处复用。
- **验证**：并发两次同邮箱注册，断言两者都是 409。

### P1-3 「四步契约」在 5 个 Action 里靠复制粘贴

- **证据**：`actions/issue.ts` 的 `createIssueAction` / `updateIssueAction` / `deleteIssueAction` / `moveIssue` / `createIssuesFromSubtasksAction` 各自重写「`safeParse` → `resolveWorkspace()` → `try/catch` → `revalidatePath`」。只有 `resolveWorkspace()` 被抽出了，`try/catch` 与 `revalidatePath` 仍是五份。
- **影响**：契约靠复制维持，新增 Action 时最容易漏掉 `revalidatePath`——而漏掉不会报错，只会「保存成功但列表不刷新」，是最难排查的一类缺陷。
- **改进**：抽 `withIssueAction(schema, handler)` 高阶封装，统一做「校验 → 鉴权 → 授权 → 执行 → revalidate → 错误收敛」，`handler` 只写业务。这同时让 P1-4 的路径常量有地方收口。
- **验证**：改造后 `actions/issue.ts` 内不应再出现裸 `revalidatePath`。

### P1-4 缓存语义混乱：`force-dynamic` 与 `revalidatePath` 并存

- **证据**：`app/(dashboard)/issues/page.tsx:11` 与 `app/(dashboard)/layout.tsx:14` 都声明 `dynamic = "force-dynamic"`；同时 5 处 `revalidatePath("/issues")`，路径字符串硬编码。
- **影响**：页面本就不缓存，`revalidatePath` 的实际收益只剩「让客户端 Router Cache 失效」，但写法上像是在维护一个并不存在的服务端缓存层，后来者会误判。路径字面量散落在 5 处，改路由要全改。
- **改进**：**二选一并在代码里写明理由**。① 要缓存：去掉 `force-dynamic`，改用 `unstable_cache` + `revalidateTag("issues")`，tag 常量化。② 确认全动态：保留 `revalidatePath`，但收进 P1-3 的统一封装，并用常量替代字面量。
- **验证**：评审通过后写一句注释锁定选择，避免后人反复来回。

### P1-5 ESLint 护栏只覆盖了部分反向依赖

- **证据**：`eslint.config.mjs` 拦了 4 条边 —— `lib → components`、`lib → react hooks`、`components → lib/prisma`、`actions → UI`。**未覆盖**：`lib → actions`、`lib → app`、`actions → app`、`components → lib/*`（prisma 之外）。
- **影响**：文档写着「只允许向下依赖」，护栏只堵了部分边。新增 `lib/` 模块时误 `import "@/actions/issue"`（真实易犯：想复用一个写操作）不会被发现，直接形成环，而环会以「构建后运行时报 undefined」的形式出现，排查成本高。
- **改进**：① 补全上述反向边；② 更彻底的做法是引入 `eslint-plugin-boundaries` 或 `dependency-cruiser`，声明式描述层级矩阵，比手写 patterns 更难漏；③ CI 增加 `madge --circular` 检环。
- **验证**：故意在 `lib/` 里 import `@/actions/issue`，`npm run lint`（本机：`node ./node_modules/eslint/bin/eslint.js .`）应报错。

### P1-6 领域层零测试覆盖，而它恰是最贵的部分

- **证据**：`tests/unit/` 5 个文件，全部覆盖**纯函数**（`validation`、`errors`、`rate-limit`、`client-ip`、`ai-parser`）。以下全部 0 覆盖：`lib/issues.ts`（跨 Workspace 隔离 + `moveIssue` 整列覆盖与「追加列尾」策略）、`lib/permissions.ts`（并发收敛与 upsert 兜底）、`lib/ai.ts`（限流/重试/超时/幂等四类分支）、`actions/*`。`tests/e2e/` 是空目录。
- **影响**：风险最高的逻辑没有回归网。`moveIssue` 的并发语义和 `createIssuesFromSubtasks` 的幂等分支一旦被改动，只能靠人工冒烟发现，而冒烟只跑 HTTP 层。
- **改进**：这三处都是**纯服务端逻辑**，用已有 Jest 即可覆盖，不依赖被拦截的 Playwright/npm —— `jest.mock("@/lib/prisma")` 注入 mock，断言「查询形状 + 分支结果」。优先级应高于补 UI 测试。
- **验证**：本机 `node ./node_modules/jest/bin/jest.js --runInBand` 出用例。

### P1-7 无根级错误/404 边界，`next.config.ts` 无安全响应头

- **证据**：`app/error.tsx`、`app/global-error.tsx`、`app/not-found.tsx`、`app/(dashboard)/error.tsx` **均不存在**（只有 `app/(dashboard)/issues/error.tsx`）。`next.config.ts` 是空对象，无 `headers()`，`poweredByHeader` 未关闭。
- **影响**：① 任何非 `/issues` 的运行时错误落到 Next 默认错误页，暴露 digest 且无重试入口；② 处理凭据的应用没有 HSTS / CSP / `X-Content-Type-Options` / `X-Frame-Options`，点击劫持与内容注入无缓解层。`security-threat-model.md` 定位了风险，但没有落到配置。
- **改进**：补 `not-found.tsx` 与根 `error.tsx`；`next.config.ts` 加 `headers()` 下发安全头（CSP 先以 `Content-Security-Policy-Report-Only` 起步，避免误伤），并设 `poweredByHeader: false`。
- **验证**：`curl -I` 检查响应头；访问不存在路径检查 404 页是否走自定义边界。

### P1-8 `WorkspaceMember.role` 是裸 String，且从不参与判定

- **证据**：`prisma/schema.prisma:93` 为 `role String @default("OWNER")` —— 与同一文件里 `IssueStatus` 使用数据库枚举的做法不一致；`lib/permissions.ts:119-128` 的 `assertWorkspaceAccess()` 只判断 membership 是否存在，**从不读 `role`**；`WorkspaceSummary.role` 一路透传到 UI 但无人消费。
- **影响**：一个「看起来有权限语义、实际不生效」的字段最容易被误读。后来的维护者很可能基于 `role` 去实现权限分支，而它从未被校验过，等于埋了一个「以为有 RBAC」的坑。
- **改进**：`role` 改为 `enum WorkspaceRole { OWNER MEMBER }` 保持枚举一致性，并在注释里显式写明「MVP 不参与判定，为后续 RBAC 预留」；或者直接移除，等真做 RBAC 再加。
- **验证**：grep `role` 的全部使用点，确认皆为透传。

### P1-9 所有权双重表达，存在漂移空间

- **证据**：`prisma/schema.prisma:77` 的 `Workspace.ownerId` 与 `lib/permissions.ts:96` 写入的 `WorkspaceMember(role="OWNER")` 同时存在，且由 `upsert` 分两步写入。
- **影响**：两条真相来源。将来支持「移交所有权」或「移除成员」时，必然出现 `ownerId` 与成员表不一致 —— 而权限判定用的是成员表，`ownerId` 会被误当作权威。
- **改进**：明确单一真源。最小成本做法：保留 `ownerId` 作为展示/审计字段，但在 Schema 注释里写明「不参与权限判定，判定以 WorkspaceMember 为准」。
- **验证**：注释即可，收益是防止误用。

---

## 5. P2 · 建议改进

| # | 问题 | 证据 | 改进方向 |
|---|---|---|---|
| P2-1 | AI 面板缺取消能力 | `ui-mockups.md` §2.5 承诺「超时、重试、取消（AbortController）」；`AiBreakdownPanel.tsx:87` 的 `fetch` 无 `signal` | 加 `AbortController` + `useEffect` 清理；用户切走后不再占用限流额度与上游配额 |
| P2-2 | AI 候选列表用 `key={index}` | `AiBreakdownPanel.tsx:225` | 删除中间项后 React 会复用错位节点。项目在 `BoardColumn`/`IssueList` 都强调稳定 key，此处自相矛盾。为候选分配稳定 id |
| P2-3 | 批量创建 `position` 与既有列撞号 | `lib/ai.ts:276` 直接 `position: index * 100`，未叠加目标列已有 `max(position)` | 落到 BACKLOG 后与老数据同号，靠 `createdAt desc` 兜底，视觉上散落而非有序追加。先取本列 max 再偏移 |
| P2-4 | 副作用混入纯映射函数 | `lib/errors.ts:61,70` 在 `toActionError` 内直接 `console.error` | 日志格式无法统一替换、函数不可纯测。改为注入 logger，或把记录上移到 Action 边界（与 `observability.md` §5 的 JSON 日志目标一并处理） |
| P2-5 | 限流淘汰顺序与保护目标相反 | `lib/rate-limit.ts:77-80` 按 Map 插入顺序淘汰；而 `Map.set` 对已存在 key **不改变插入位置** | 最早插入的恰是长期活跃的合法 key，会最先被驱逐 —— 攻击者可用海量随机 key 稀释他人限流。改 LRU（淘汰前先 `delete` 再 `set` 刷新位置），或按 `hits.length` 升序淘汰 |
| P2-6 | 未使用依赖 | `@auth/prisma-adapter` 在 `package.json` 但源码零引用（`lib/auth.ts:19` 明确说不接适配器） | 移除，或留 TODO 注释说明为何预装 |
| P2-7 | 写路径隐式创建工作区 | `actions/issue.ts:49-52` 每次写操作都走 `ensureWorkspaceForUser` | 多一次 `findFirst`，且「一次写操作会创建出工作区」这个副作用不明显。写路径改用不创建的 `assertWorkspaceAccess`，或把 workspaceId 放进会话 |
| P2-8 | 文档与实现漂移 | `architecture.md` §5.1 目录树缺 `lib/issues.ts`、`lib/ai-parser.ts`、`lib/rate-limit.ts`、`lib/client-ip.ts`、`lib/password.ts`、`components/board/`、`hooks/useBoardMove.ts`、`types/action.ts` | 更新目录树与模块职责表，否则新人会照文档去找不到的文件 |
| P2-9 | 无 Suspense 分段流式 | `app/(dashboard)/issues/page.tsx:24-26` 串行 await 后整页渲染；`loading.tsx` 只能给整页骨架 | 用 `<Suspense>` 分别包住列表与 `<AiBreakdownPanel />`，让列表先出、AI 面板独立流式 |
| P2-10 | 目录残留 `.gitkeep` | `components/{ui,layout,issue,board}/.gitkeep`、`lib/`、`hooks/`、`types/`、`tests/unit/` | 目录已有真实文件后删除，保持目录清单可读 |
| P2-11 | AI 输出靠贪婪正则抽取 | `lib/ai-parser.ts:9` 的 `/\[[\s\S]*\]/` 会从**第一个** `[` 匹配到**最后一个** `]` | 模型若返回「说明 [1,2] 更多 [3]」会拼出非法 JSON。虽 fail-safe（零写入）但浪费一次可恢复的响应。正解是改用 AI SDK 的结构化输出（`generateObject` + Zod schema）替代 `generateText` + 正则，从根上消除解析环节 |

---

## 6. 建议的修复批次

按「风险 × 成本」排序，每批可独立提交：

| 批次 | 内容 | 说明 |
|---|---|---|
| 批次 1（小改动、高收益） | P1-1、P1-2、P2-6、P2-10、P1-9、P1-8 | 全是常量替换、删除与注释级改动，1 小时内可完成 |
| 批次 2（安全与契约） | P0-2、P0-3、P1-7 | 修主键派生、加 `proxy.ts`、补错误边界与安全头 |
| 批次 3（结构重构） | P0-1、P1-3、P1-4 | 拆 `lib/issue-batch.ts`、抽 `withIssueAction()`、锁定缓存策略 |
| 批次 4（性能） | P0-5、P0-4、P2-3 | 整列 SQL 重写 → 分页 → position 偏移；建议先做 P0-5 |
| 批次 5（工程护栏） | P1-5、P1-6 | 补全依赖矩阵 + 领域层 Jest 覆盖 |
| 批次 6（体验收尾） | P2-1、P2-2、P2-9、P2-11、P2-4、P2-5、P2-7、P2-8 | 可与 Sprint 4 的收尾工作合并 |

---

## 7. 值得保留的设计（复审时不要动）

评审容易只列问题，但以下决策质量高于平均水平，改动前应有充分理由：

1. **`lib/prisma.ts` 的惰性单例** —— 让「构建不依赖运行时配置」成立，使无 `.env` 的 Docker/CI 能构建成功。这是很少被做对的一点。
2. **`lib/env.ts` 的必需/可选两级划分** —— 让「AI 未配置」不等于「服务不健康」，直接决定了 compose 的 `service_healthy` 语义是否正确。
3. **`ensureWorkspaceForUser` 的确定性 ID + upsert + P2002 兜底** —— 用一个 ID 设计解决并发重复创建，比加锁更省。
4. **`moveIssue` 的「整列覆盖 + 追加列尾」并发语义** —— 显式规定后写者赢、新卡不丢，语义清晰可测。
5. **幂等键 + 确定性主键**（P0-2 要改的是前缀，不是这个思路本身）—— 不改 Schema 就拿到批量创建幂等，是有性价比的取舍。
6. **`useBoardMove` 的三类同步暂停** —— 正确识别了「RSC 刷新会冲掉本地乐观状态」这个真实问题，比绝大多数乐观更新实现完整。
7. **把依赖方向写成 ESLint 错误** —— 虽然覆盖不全（P1-5），但方向完全正确：架构约束要可执行。

