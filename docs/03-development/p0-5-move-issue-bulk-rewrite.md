# P0-5 落地方案：`moveIssueWithinWorkspace` 整列重写为单条 SQL

> 来源：`docs/02-architecture/architecture-review.md` P0-5
> 影响文件：`lib/issues.ts`（`moveIssueWithinWorkspace`，第 155–200 行）
> 方案状态：**已实施（2026-09-12）**——`buildMoveIssueUpdate()` 已落地 `lib/issues.ts`，`tests/unit/move-issue-sql.test.ts` 通过；本文档转为实施留档
> 文档版本：v1.1 · 2026-09-12

---

## 1. 目标与范围

### 1.1 要解决的问题

`lib/issues.ts:193-198` 在事务内用 `for` 循环逐条 `UPDATE` 写 `position`：

```ts
for (let index = 0; index < fullOrder.length; index += 1) {
  await tx.issue.update({ where: { id: fullOrder[index] }, data: { position: index * 100 } });
}
```

列长度上限由 `lib/validation.ts:105` 定为 500。因此一次拖拽最多产生 **500 条串行 UPDATE**，全部在一个交互式事务内持有；Prisma 交互式事务默认超时 5 秒。超时后事务回滚，客户端 `hooks/useBoardMove.ts:73` 执行 `setIssues(rollbackTo)`，用户看到「拖了又弹回去」，且重试大概率再次失败。

这是本报告中唯一**在正常使用下（非极端攻击）就会发生**的 P0。

### 1.2 本方案的改动边界

| 项 | 说明 |
|---|---|
| **改** | `lib/issues.ts` 事务内的**第 3 步（改 status）与第 4 步（写 position）**，合并为一条 SQL |
| **不改** | 第 1 步归属校验、第 2 步读取目标列、`fullOrder` 的组装规则、函数签名、`MoveIssueParams` 契约、`actions/issue.ts` 的调用方式 |
| **不改** | 源列的 position 空洞、`position` 步长 100、列表排序改走 `createdAt` 的既有决策 |
| **新增** | 一个可单测的纯函数 `buildMoveIssueUpdate()`（把 SQL 构造从 IO 中剥离，使本次改动可验证） |

**范围锁定的理由**：这是一次**纯性能重构**。混入语义变更会让「新旧是否等价」无法论证。第 9 章单列了两个可选语义变更，但不属于本次落地内容。

---

## 2. 现状剖析

### 2.1 现有实现逐步拆解

| 步 | 位置 | 做的事 | 往返数 |
|---|---|---|---|
| 1 | `lib/issues.ts:161-168` | `uniqueIds` 去重；校验 `issueId` 在清单内；`count` 校验全部 id 归属当前 Workspace，否则 `NOT_FOUND` | 1 |
| 2 | `lib/issues.ts:173-184` | 读目标列现有卡片（`status = toStatus`，按 `position, createdAt desc, id desc` 排序）；组装 `fullOrder = orderedInColumn ++ appended` | 1 |
| 3 | `lib/issues.ts:187-190` | `updateMany` 把被拖卡片 `status` 改为 `toStatus` | 1 |
| 4 | `lib/issues.ts:193-198` | 逐条 `update` 写 `position = index * 100` | **N** |
| | | **合计** | **N + 3** |

### 2.2 关键推导：`fullOrder` 的行集合恒等式

这是本方案正确性的基础，必须先证明：

- `orderedInColumn = uniqueIds.filter(id => id === issueId || targetColumnIds.has(id))`
- `appended = columnRows.filter(row => !known.has(row.id))`，`known = Set(uniqueIds)`
- `fullOrder = orderedInColumn ++ appended`

对 `columnRows` 中任一卡片 `c`（即读取时已在目标列）：
- 若 `c ∈ known`，则 `c` 满足 `targetColumnIds.has(c)`，故 `c ∈ orderedInColumn`
- 若 `c ∉ known`，则 `c ∈ appended`

反之 `orderedInColumn ⊆ columnRows ∪ {issueId}`（过滤条件只放行这两类）。

**结论（恒等式）：`fullOrder = columnRows ∪ {issueId}`，且成员互不重复、顺序完全由 TS 决定。**

由此得到两个直接推论：
1. **行集合与列状态无关**：`fullOrder` 的每个成员最终 `status` 都等于 `toStatus`（`columnRows` 本就在该列，`issueId` 被移入该列）。因此 `status` 可以整批赋值，不需要逐行判断。
2. **行集合无法在 SQL 内重建**：`fullOrder` 的顺序来自客户端清单，SQL 不能自行推断。SQL 只负责「按给定的序号落值」。

### 2.3 必须保持不变的语义（冻结项）

以下 8 条在改写后必须逐条成立，作为评审 checklist：

| 编号 | 冻结语义 |
|---|---|
| F1 | `workspaceId` 由服务端传入，绝不来自客户端；所有行匹配都带它 |
| F2 | 清单内任一 id 不属于当前 Workspace → 整个请求 `NOT_FOUND`（不区分「不存在」与「无权限」） |
| F3 | `issueId` 不在 `orderedIds` 内 → `VALIDATION_FAILED` |
| F4 | 客户端清单里**不属于目标列**且不是 `issueId` 的卡片**不参与重排**，保持原 `position` |
| F5 | 读取时刻已在目标列、但客户端清单未提及的卡片（并发新增）**追加到列尾**，不得丢失 |
| F6 | 最终 `position` 一律为 `index * 100`，`index` 为在 `fullOrder` 中的下标 |
| F7 | 被拖卡片的 `status` 变为 `toStatus`；其余卡片状态不变 |
| F8 | 整列覆盖、后写者赢的并发语义不变 |

---

## 3. 目标列与涉及的数据库对象

### 3.1 「目标列」的定义

**目标列 = `fullOrder` 这张有序 id 列表**，而不是 SQL 意义上的某个集合。它由两部分拼成（见 §2.2）：

```
fullOrder = [ 客户端清单中「已在目标列」或「被拖动」的 id（保持客户端顺序） ]
          ++ [ 读取时已在目标列、但客户端未提及的 id（按 position,createdAt desc,id desc） ]
```

**被重写的行 = `fullOrder` 的全部成员，一行不多、一行不少。** 这是本方案与「用 `WHERE status = toStatus` 反推行集合」的关键区别——后者会把步骤 2 之后并发插入的卡片也纳入写集合，破坏等价性（详见 §8 E3）。

### 3.2 精确标识符（取自 `prisma/migrations/`）

原始 SQL 必须与迁移产生的物理名严格一致。以下均来自 `20260910000000_init/migration.sql` 与 `20260911000000_add_issue_position/migration.sql`：

| 对象 | 物理名 | 来源 |
|---|---|---|
| 表 | `"Issue"` | Prisma 默认（无 `@@map`），大小写敏感，**必须加双引号** |
| 列 | `"id"` `"workspaceId"` `"status"` `"position"` `"updatedAt"` | 同上，无 `@map` → camelCase 原样 |
| 枚举类型 | `"IssueStatus"` | `CREATE TYPE "IssueStatus" AS ENUM (...)` |
| 主键索引 | `"Issue_pkey"` on (`"id"`) | UPDATE 按 id 定位，走 PK |
| 复合索引 | `"Issue_workspaceId_status_position_idx"` on (`"workspaceId"`,`"status"`,`"position"`) | 步骤 2 的读取用它 |
| `"updatedAt"` 类型 | **`TIMESTAMP(3)`（无时区）** | ⚠ 决定 §5 的时间表达式写法 |
| `"position"` 类型 | `INTEGER NOT NULL DEFAULT 0` | 非空，可安全整批赋值 |

---

## 4. 重写规则与转换逻辑

### 4.1 规则清单

| 规则 | 内容 |
|---|---|
| R1 | 第 3 步与第 4 步合并为**一条** `UPDATE`，全部在 `tx`（事务客户端）内执行 |
| R2 | 行集合通过 **`UPDATE ... FROM` 与一个 `WITH ORDINALITY` 的 CTE 内连接**确定，不使用 `WHERE status = ...` 反推 |
| R3 | 序号由 `WITH ORDINALITY` 提供（1 起算），`position = (ord - 1) * 100`，与现有 `index * 100` 严格一致 |
| R4 | `status` 整批赋值为 `toStatus`（依据 §2.2 推论 1，无需 `CASE`） |
| R5 | `"updatedAt"` 显式写 `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`，**不得依赖 Prisma 的 `@updatedAt`**（原始 SQL 不触发它，见 §9） |
| R6 | 用 `$executeRaw` 的返回行数做运行时断言：`affected !== fullOrder.length` → `NOT_FOUND` |
| R7 | `workspaceId` 保留在 `WHERE` 中作纵深防御（`id` 虽为全局唯一主键，但不依赖这一点） |

### 4.2 改写前后对应关系

**语句级映射**

| 现状语句 | 往返 | 改写后 | 往返 |
|---|---|---|---|
| `tx.issue.count`（归属校验） | 1 | 不变 | 1 |
| `tx.issue.findMany`（读目标列） | 1 | 不变 | 1 |
| `tx.issue.updateMany`（改 status） | 1 | **合并进 S3** | — |
| `tx.issue.update` × N（写 position） | N | **合并进 S3** | — |
| （无） | — | **S3：单条 `UPDATE ... FROM`** | 1 |
| **合计** | **N + 3** | | **3** |

N = 500 时：**503 次往返 → 3 次**。

**行级映射**（四种行，逐列对照）

| 行类别 | `status` | `position` | `updatedAt` | 与现状是否一致 |
|---|---|---|---|---|
| 被拖动的卡片 | → `toStatus` | → `index * 100` | → `now()` | ✅ 一致（现状由步骤 3 与步骤 4 各写一次） |
| 客户端清单内、已在目标列的卡片 | 不变（本即 `toStatus`） | → `index * 100` | → `now()` | ✅ 一致 |
| 客户端未提及、已在目标列的卡片（`appended`） | 不变 | → `index * 100` | → `now()` | ✅ 一致 |
| **不在 `fullOrder` 的行**（其他列、其他 Workspace） | 不变 | **不变** | **不变** | ✅ 一致（现状循环只覆盖 `fullOrder`） |
| 清单中属于其他列 / 不存在的 id | 步骤 1 即 `NOT_FOUND` | — | — | ✅ 一致 |

**变量级映射**

| 现状变量 | 改写后归宿 |
|---|---|
| `fullOrder` | 作为 CTE 的 `ARRAY[...]` 参数，顺序即序号 |
| `params.issueId` | 不再需要单独出现在 SQL 中（其 `status` 由 R4 整批赋值覆盖） |
| `params.toStatus` | `SET "status" = $k::"IssueStatus"` |
| `params.workspaceId` | `WHERE i."workspaceId" = $k` |

---

## 5. SQL 语句清单

### 5.1 S1 · 归属校验（**保留，不改**）

```ts
const ownedCount = await tx.issue.count({
  where: { id: { in: uniqueIds }, workspaceId: params.workspaceId },
});
if (ownedCount !== uniqueIds.length) throw new AppError("NOT_FOUND");
```

### 5.2 S2 · 读取目标列（**保留，不改**）

```ts
const columnRows = await tx.issue.findMany({
  where: { status: params.toStatus, workspaceId: params.workspaceId },
  orderBy: [{ position: "asc" }, { createdAt: "desc" }, { id: "desc" }],
  select: { id: true },
});
```

### 5.3 S3 · 单条整列重写（**新增，替代原步骤 3 + 步骤 4**）

```sql
WITH ordered AS (
    SELECT id, ord
    FROM unnest(ARRAY[$1, $2, ..., $N]::text[]) WITH ORDINALITY AS t(id, ord)
)
UPDATE "Issue" AS i
SET
    "position"  = ((o.ord - 1) * 100)::int,
    "status"    = $N1::"IssueStatus",
    "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM ordered AS o
WHERE i."id" = o.id
  AND i."workspaceId" = $N2
```

> 上表的 `$1 … $N` 是**阅读用示意**。Prisma 实际把参数渲染为 `?`：`Prisma.Sql` 的 `.sql` 输出形如 `unnest(ARRAY[?,?,?]::text[])`，真实值在 `.values` 数组里按位置绑定。写单测断言时以 `?` 为准（见 §10.1）。

要点逐条解释：

| 片段 | 为什么这么写 |
|---|---|
| `WITH ordered AS (...)` | 把「id → 序号」的映射作为有序集合物化。PostgreSQL 允许 CTE 位于 `UPDATE` 之前 |
| `ARRAY[...]::text[]` | 构造文本数组。显式 `::text[]` 保证 N 个参数的类型可被推断（否则裸参数在数组构造子里类型未定） |
| `WITH ORDINALITY AS t(id, ord)` | 让数组位置成为一等列。`ord` 从 1 起算，`(ord-1)*100` 即现有 `index*100` |
| `((o.ord - 1) * 100)::int` | `ordinality` 的类型是 `bigint`，显式转 `int` 与列类型对齐，避免依赖隐式赋值转换 |
| `"status" = $N1::"IssueStatus"` | 依据 §2.2 推论 1 整批赋值；显式转型让非法值**报错而非静默** |
| `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')` | 见下方「时区陷阱」，**这是本方案最容易写错的一行** |
| `FROM ordered AS o` | 内连接语义：只有出现在 `ordered` 里的行会被更新，**行集合恰为 `fullOrder`** |
| `AND i."workspaceId" = $N2` | R7 纵深防御 |

**⚠ 时区陷阱（必须遵守）**

`"updatedAt"` 的物理类型是 `TIMESTAMP(3)`，**不带时区**；而 `CURRENT_TIMESTAMP` / `now()` 返回 `timestamptz`。二者相减时 PostgreSQL 会按会话 `TimeZone` 做隐式转换：

- 会话 `TimeZone = UTC`（当前 `postgres:16-alpine` 的默认值）→ 结果正确
- 会话 `TimeZone = Asia/Shanghai` → 写入的墙钟时间比 Prisma 写入的**快 8 小时**

Prisma 的 `@updatedAt` 写入的是 UTC 墙钟，所以必须显式写成 `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')` 把 UTC 墙钟固定下来，而不是依赖会话配置。

> 顺带记录一个既有隐患（非本次范围）：`createdAt` 的库级默认值是 `DEFAULT CURRENT_TIMESTAMP`，同样受会话时区影响，而 `updatedAt` 由 Prisma 按 UTC 写。二者在非 UTC 会话下会落在不同时区。当前 `updatedAt` 未在任何界面渲染（`IssueCard.tsx` 与 `IssueRow.tsx` 只展示 `createdAt`），影响为零，但换用非 UTC 时区的云数据库实例时值得复查。

### 5.4 参数绑定表

| 占位符 | 值 | 类型 | 数量 |
|---|---|---|---|
| `$1 … $N` | `fullOrder` 各成员（顺序即序号） | `text` | N |
| `$N1` | `params.toStatus` | `IssueStatus` | 1 |
| `$N2` | `params.workspaceId` | `text` | 1 |
| | | **合计** | **N + 3** |

参数规模上限（详见附录 A）：N ≤ 500 → 503 个参数，PostgreSQL 协议上限 65535，余量两个数量级。

### 5.5 构造实测记录（已验证，非推断）

本方案的主 SQL 与附录 B 的备选 SQL 均已在真实 Prisma 运行时上跑过一次构造（`@prisma/client` v6.19.3，不连数据库，只调用 `Prisma.sql` / `Prisma.join`）。实测输出：

**方案 A**（`fullOrder = ["iss_a","iss_b","iss_c"]`）

```
values: ["iss_a","iss_b","iss_c","IN_PROGRESS","ws_default_user1"]     ← N + 3，顺序正确
sql:
    WITH ordered AS (
      SELECT id, ord
      FROM unnest(ARRAY[?,?,?]::text[]) WITH ORDINALITY AS t(id, ord)
    )
    UPDATE "Issue" AS i
    SET
      "position"  = ((o.ord - 1) * 100)::int,
      "status"    = ?::"IssueStatus",
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    FROM ordered AS o
    WHERE i."id" = o.id
      AND i."workspaceId" = ?
```

**三条实测结论**（都影响实现细节，故记录在此）：

1. `Prisma.Sql` 的 `.sql` **渲染为 `?` 占位符，不是 `$1`**。写单测断言必须以此为准。
2. `Prisma.join` 的**默认分隔符是 `","`（无空格）**。附录 B 若用默认值会生成 `WHEN ? THEN ?,WHEN ? THEN ?`，是语法错误——必须显式传 `" "`。
3. `ARRAY[...]::text[]` 的类型推断成立，无需逐元素 `::text`（§8 E18 的兜底写法仅为保险）。

---

## 6. 完整实现代码

可直接替换 `lib/issues.ts` 中 `moveIssueWithinWorkspace` 的实现，并新增两个导出。

### 6.1 新增：SQL 构造器（纯函数，可单测）

```ts
import { Prisma } from "@prisma/client";

/**
 * 构造「整列重写」的单条 UPDATE（P0-5）。
 *
 * 抽成纯函数是为了能脱离数据库做单元测试：
 * 断言 Prisma.Sql 的 .sql 与 .values，即可验证序号、参数顺序与转型是否写对。
 *
 * 设计要点：
 * - 用 WITH ORDINALITY 把数组下标变成序号列，避免 N 个 CASE WHEN（也避开 CASE 分支间
 *   不能有逗号的语法坑）；
 * - 行集合由 JOIN 决定，恰为 fullOrder，不会误伤并发插入的卡片；
 * - 必须显式写 updatedAt：原始 SQL 不触发 Prisma 的 @updatedAt。
 */
export function buildMoveIssueUpdate(params: {
  fullOrder: readonly string[];
  toStatus: IssueStatusValue;
  workspaceId: string;
}): Prisma.Sql {
  if (params.fullOrder.length === 0) {
    throw new AppError("VALIDATION_FAILED", { message: "排序列表为空" });
  }

  return Prisma.sql`
    WITH ordered AS (
      SELECT id, ord
      FROM unnest(ARRAY[${Prisma.join(params.fullOrder)}]::text[]) WITH ORDINALITY AS t(id, ord)
    )
    UPDATE "Issue" AS i
    SET
      "position"  = ((o.ord - 1) * 100)::int,
      "status"    = ${params.toStatus}::"IssueStatus",
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    FROM ordered AS o
    WHERE i."id" = o.id
      AND i."workspaceId" = ${params.workspaceId}
  `;
}
```

### 6.2 替换：`moveIssueWithinWorkspace` 的事务体

```ts
export async function moveIssueWithinWorkspace(params: MoveIssueParams): Promise<void> {
  const uniqueIds = [...new Set(params.orderedIds)];
  if (!uniqueIds.includes(params.issueId)) {
    throw new AppError("VALIDATION_FAILED", { message: "排序列表缺少被移动的任务" });
  }

  await getPrisma().$transaction(async (tx) => {
    // 1. 归属校验（不变）
    const ownedCount = await tx.issue.count({
      where: { id: { in: uniqueIds }, workspaceId: params.workspaceId },
    });
    if (ownedCount !== uniqueIds.length) {
      throw new AppError("NOT_FOUND");
    }

    // 2. 组出目标列的最终顺序（不变）
    const columnRows = await tx.issue.findMany({
      where: { status: params.toStatus, workspaceId: params.workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const known = new Set(uniqueIds);
    const targetColumnIds = new Set(columnRows.map((row) => row.id));
    const orderedInColumn = uniqueIds.filter(
      (id) => id === params.issueId || targetColumnIds.has(id)
    );
    const appended = columnRows.filter((row) => !known.has(row.id)).map((row) => row.id);
    const fullOrder = [...orderedInColumn, ...appended];

    // 3. 单条 SQL 完成「改状态 + 整列重写 position」（原步骤 3 + 步骤 4）
    const affected = await tx.$executeRaw(
      buildMoveIssueUpdate({
        fullOrder,
        toStatus: params.toStatus,
        workspaceId: params.workspaceId,
      })
    );

    // 4. 行数断言：并发删除会让实际写入行数少于预期，必须与现状一样失败，而不是静默成功
    if (affected !== fullOrder.length) {
      throw new AppError("NOT_FOUND");
    }
  });
}
```

**相比现状的净变化**：`N + 3` 次往返降为 `3` 次；新增一次行数断言（原实现靠 `update` 匹配不到行时抛 P2025 达成同样效果）。

---

## 7. 必填约束

实施时以下 11 条为硬约束，任一条不满足即视为方案未落地。

| 编号 | 约束 | 理由 |
|---|---|---|
| C1 | 第 1、2 步及其**执行顺序**不得改动 | 冻结项 F1–F5 全部落在这两步 |
| C2 | 必须在同一事务内执行（`tx.$executeRaw`，而非 `getPrisma().$executeRaw`） | 否则归属校验与写入之间存在 TOCTOU 窗口 |
| C3 | 必须使用 `Prisma.sql` + `Prisma.join` 参数化；**禁止** `$executeRawUnsafe`、禁止字符串拼接 | 注入防护；`fullOrder` 来自客户端 |
| C4 | 必须写 `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`；**禁止**裸 `now()` / `CURRENT_TIMESTAMP` | 列类型为无时区 `TIMESTAMP(3)`，见 §5.3 时区陷阱 |
| C5 | 必须断言 `affected === fullOrder.length`，不等则抛 `NOT_FOUND` | 并发删除时必须失败而非静默；见 §8 E6 |
| C6 | `toStatus` 必须带 `::"IssueStatus"` 显式转型 | 非法值报错而非静默写入 |
| C7 | `fullOrder` 必须保持去重（沿用 `new Set`） | `UPDATE ... FROM` 遇到重复 id 会任取一行而不报错，与现有逐条 `update` 行为不同 |
| C8 | `WHERE` 必须保留 `"workspaceId"` 过滤 | 纵深防御，不依赖「id 是全局唯一主键」这一隐含前提 |
| C9 | `fullOrder` 为空必须提前抛错，不得生成 `ARRAY[]::text[]` | 空数组构造需显式类型且会让 UPDATE 影响 0 行，语义含糊 |
| C10 | `ord - 1` 的结果必须显式 `::int` | `ordinality` 为 `bigint`，不依赖隐式赋值转换 |
| C11 | 不得在 SQL 内推断顺序（不得用 `ORDER BY` 重建 `fullOrder`） | 顺序的唯一真源是 TS 里的 `fullOrder`；SQL 只按序号落值 |

---

## 8. 边界情况清单

| 编号 | 场景 | 处理方式 | 是否行为变更 |
|---|---|---|---|
| E1 | **同列内重排**（`toStatus` 等于卡片当前状态） | `fullOrder` 即客户端顺序；`status` 赋同值；位置照常重写 | 否 |
| E2 | **跨列移动** | 被拖卡片进入目标列；**源列保留 position 空洞**（如 0,100,300） | 否（源列不归一化是既有行为，见附录 C） |
| E3 | **步骤 2 之后、UPDATE 之前并发插入目标列** | 新卡片不在 `fullOrder`，不被本语句匹配 → 保持原 `position`，可能与新写入的序号重号 | 否（现状同样如此，只是窗口更短） |
| E4 | **清单混入其他列的卡片 id** | `orderedInColumn` 过滤掉；不在 `fullOrder`；行集合不含它 → 完全不动 | 否 |
| E5 | **清单混入不存在的 id** | 步骤 1 `ownedCount !== uniqueIds.length` → `NOT_FOUND`，整请求失败 | 否 |
| E6 | **步骤 2 之后卡片被并发删除** | `affected < fullOrder.length` → C5 断言抛 `NOT_FOUND` | **是（改进）**：现状抛 Prisma P2025 → `INTERNAL` 500；新实现返回 `NOT_FOUND`，语义更准 |
| E7 | **`orderedIds` 含重复** | `Set` 去重（与现状一致）。注意去重会改变下标，故 `position` 按去重后序号 | 否 |
| E8 | **目标列原本为空、拖入一张卡** | `columnRows = []`；`fullOrder = [issueId]`；`N = 1`，`ARRAY[$1]::text[]` 合法 | 否 |
| E9 | **拖到空列（落点在列容器）** | `Board` 发出 `orderedIds = [issueId]`，同上 | 否 |
| E10 | **`fullOrder` 长度为 1** | 单成员 CTE，`ord = 1` → `position = 0` | 否 |
| E11 | **N = 500（上限）** | 503 个参数、语句文本约 3.7 KB，远低于协议上限 | 否 |
| E12 | **`position` 溢出** | 500 × 100 = 50 000 `int4`；即使 2000 万张卡也在范围内 | 否 |
| E13 | **同一 Workspace 并发两次拖拽同一列** | 整列覆盖、后写者赢；单条语句把写窗口从「N 次往返」压缩到「1 次」，实际碰撞率下降 | 否（语义不变，概率改善） |
| E14 | **会话时区非 UTC** | C4 的 `AT TIME ZONE 'UTC'` 保证 `updatedAt` 仍为 UTC 墙钟 | 否 |
| E15 | **原始 SQL 抛错**（如转型失败、CASE 之外的语法错） | 非 `AppError` → `toActionError` → `INTERNAL`，事务回滚 | 否 |
| E16 | **`array_position` 返回 NULL 的风险** | 本方案不用 `array_position`（用 JOIN），不存在该问题 | 不适用 |
| E17 | **`issueId` 不在 `fullOrder`** | 前置检查已保证；若将来改动 `orderedInColumn` 过滤条件，需重新论证 §2.2 恒等式 | 不适用 |
| E18 | **Prisma 参数类型推断失败**（数组构造子报 `could not determine data type`） | 兜底写法：`ARRAY[${Prisma.join(fullOrder)}]::text[]` 改为逐元素显式转型 `ARRAY[${Prisma.join(fullOrder.map((id) => Prisma.sql`${id}::text`))}]` | 不适用 |

---

## 9. 行为变更与决策点

### 9.1 `updatedAt` 的两种写法（必须显式选择）

原始 SQL **不会触发 Prisma 的 `@updatedAt`**，必须手写。这带来一个必须做的决策：

| 选项 | SQL | 结果 | 评价 |
|---|---|---|---|
| **A（本方案默认）** | `"updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')` 无条件赋值 | 行集合内所有卡片 `updatedAt` 都被刷新，**与现状完全一致** | 纯重构，等价性可论证，**建议本方案采用** |
| **B（可选改进，另开提交）** | `"updatedAt" = CASE "id" WHEN ${issueId} THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE "updatedAt" END` | 只有被拖卡片刷新 `updatedAt`，`updatedAt` 恢复「内容被修改」的语义 | 这是 `lib/issues.ts:57-59` 注释自己在抱怨的问题的**真正修复**，见下 |

**选项 B 的论证**：`lib/issues.ts:57-59` 的注释写道——「**不能用 updatedAt**——看板拖拽会重写整列 position，而 Prisma 的 @updatedAt 会因此刷新目标列所有卡片的 updatedAt，结果是『拖一张卡，整个目标列跳到列表顶部』，updatedAt 也不再代表『内容被修改』。」

现状是「用 `createdAt` 排序来绕开这个坑」。选项 B 直接消除坑本身。之所以不作为默认：本次是**性能重构**，混入语义变更会让等价性无法论证。建议流程是先用 A 落地并验证，再单开一次提交切到 B，并在同一次提交里补一条断言「拖拽不改动其它卡片的 updatedAt」。

**选 B 时的附带判断**：列表排序**仍应保持 `createdAt`**。理由与 `updatedAt` 语义无关，而是索引对齐——`@@index([workspaceId, createdAt])` 已存在，改回 `updatedAt` 会引入额外索引需求，收益为零。

### 9.2 一项已被排除的变更

**源列 position 归一化**：被拖走的卡片会在源列留下空洞。是否应在同一次移动里重排源列？**不做**，理由见附录 C。

---

## 10. 验证方案

按顺序执行，前三项在合并前必须全绿。

### 10.1 单元测试：断言 SQL 构造结果（不需要数据库）

这是本方案能提供的最强保证，也是让 `lib/issues.ts` 摆脱「零测试覆盖」（评审 P1-6）的切入点。`Prisma.Sql` 对象暴露 `.sql`（含 `$n` 占位符的文本）与 `.values`（参数数组），可直接断言。

新增 `tests/unit/move-issue-sql.test.ts`：

```ts
import { buildMoveIssueUpdate } from "@/lib/issues";

describe("整列重写 SQL 构造", () => {
  test("序号按数组下标以 100 为步长生成，且参数顺序与占位符一致", () => {
    const query = buildMoveIssueUpdate({
      fullOrder: ["a", "b", "c"],
      toStatus: "IN_PROGRESS",
      workspaceId: "ws_1",
    });

    // 参数顺序：ids... → toStatus → workspaceId
    expect(query.values).toEqual(["a", "b", "c", "IN_PROGRESS", "ws_1"]);
    expect(query.sql).toContain("WITH ORDINALITY");
    expect(query.sql).toContain("((o.ord - 1) * 100)::int");
    expect(query.sql).toContain('::"IssueStatus"');
    expect(query.sql).toContain("AT TIME ZONE 'UTC'");

    // ⚠ Prisma.Sql 的 .sql 把参数渲染为 "?" 而不是 "$1"
    //   因此这里断言结构不变量：占位符个数必须等于参数个数（N + 3）。
    //   这是最能兜住「参数与占位符错位」的一行——错位时此断言必挂。
    expect((query.sql.match(/\?/g) ?? []).length).toBe(query.values.length);
    expect(query.values.length).toBe(3 + 3);
  });

  test("fullOrder 为空时拒绝构造", () => {
    expect(() =>
      buildMoveIssueUpdate({ fullOrder: [], toStatus: "DONE", workspaceId: "ws_1" })
    ).toThrow(/排序列表为空/);
  });
});
```

执行（本机 `npm` 被安全策略拦截，直接调入口文件）：

```bash
node ./node_modules/jest/bin/jest.js --runInBand tests/unit/move-issue-sql.test.ts
```

**覆盖的约束**：R3、R5、C3、C4、C6、C8、C9、C10（断言字符串即证明写对）。

### 10.2 等价性测试：新旧实现逐行比对（**合并前必须跑**）

拖拽走的是客户端 JS 直调 Server Action，**HTTP 冒烟脚本无法触达**（`actions/issue.ts:154` 注释已说明「不存在渐进增强通道」）。因此这是唯一能证明「纯重构未改语义」的手段。

做法：

1. 保留旧实现为 `moveIssueWithinWorkspaceLegacy`（仅本地，不提交）。
2. 固定装置数据：同一 Workspace 造 4 列，其中一列放 20 张卡（含 3 张 `position` 相同的、由 `createdAt desc` 兜底的历史数据）；另造第二个 Workspace 的卡片用于越权用例。
3. 对以下 9 个场景，分别用新旧实现跑一遍，再查 `SELECT id, status, position, "updatedAt" FROM "Issue" WHERE "workspaceId" = ... ORDER BY id`，**逐行 diff**：

| 场景 | 对应冻结项 |
|---|---|
| 跨列拖到列中 | F6、F7 |
| 同列内重排 | E1 |
| 拖到空列 | E9 |
| 拖到列尾（落点为列容器） | E8 |
| 清单含重复 id | E7 |
| 清单含其他列卡片 id | F4 / E4 |
| 清单含不存在 id（应 `NOT_FOUND`） | F2 / E5 |
| 清单缺 `issueId`（应 `VALIDATION_FAILED`） | F3 |
| 目标列存在客户端未提及的卡片 | F5 |

4. 断言：**除 `updatedAt` 的时间戳数值外，`(id, status, position)` 三元组完全一致**；`updatedAt` 只断言「是否被刷新」这一布尔属性（时间值不可比）。
5. 跑完删除 legacy 实现。

### 10.3 性能验证

```bash
# 1. 造满 500 张卡的一列
# 2. 开启 Prisma 查询日志
#    lib/prisma.ts 已在非生产环境输出 warn/error；临时改成 log: ["query"] 观察
# 3. 触发一次拖拽，记录：
#    - "moveIssue" Action 的端到端耗时
#    - Prisma 输出的语句条数
```

判定标准：

| 指标 | 改造前（预期） | 改造后（要求） |
|---|---|---|
| 事务内语句条数 | 503 | **3** |
| 500 卡整列重写耗时 | 接近或超过 5 s（大概率超时失败） | **< 300 ms** |
| 事务是否超时 | 是 | 否 |

### 10.4 现有冒烟回归

```bash
docker-compose up -d --build
docker-compose ps            # 确认 db 与 app 均 healthy
node scripts/smoke.mjs       # P0 全流程回归
```

冒烟不覆盖拖拽本身，但覆盖「Issue 创建 → 编辑 → 删除 → 列表倒序」等共用 `lib/issues.ts` 的路径，可确认本次改动没有波及 CRUD。

---

## 11. 落地步骤（建议提交拆分）

| 提交 | 内容 | 独立可验证 |
|---|---|---|
| 1 | 新增 `buildMoveIssueUpdate()` 与 `tests/unit/move-issue-sql.test.ts` | ✅ 跑单测（此时生产路径未变） |
| 2 | 替换 `moveIssueWithinWorkspace` 事务内的步骤 3 + 步骤 4 | ✅ 跑 10.2 等价性 + 10.3 性能 |
| 3（可选） | 切换 `updatedAt` 到选项 B，并补断言 | ✅ 断言「拖拽不改动其它卡片的 `updatedAt`」 |

拆成三步的意义：提交 1 落地时**不改变任何运行时行为**，可以先把测试建起来；提交 2 才是行为主体；提交 3 是独立的语义决策。

---

## 12. 回滚方案

`moveIssueWithinWorkspace` 是自包含函数，无 Schema 变更、无迁移、无接口变更。回滚即恢复该函数原实现（连同新增的 `buildMoveIssueUpdate` 一并保留或删除均可，前者不影响运行时）。**回滚不涉及数据修复**——两种实现写出的 `(status, position)` 完全相同，不存在需要回滚的数据形态。

（相对地，附录 B 的 `unnest` 变体同样无 Schema 变更，回滚成本一致。）

---

## 附录 A：参数规模与上限测算

| 方案 | 参数数量 | N = 500 | 语句文本长度（N=500） | PostgreSQL 上限余量 |
|---|---|---|---|---|
| **本方案**（`WITH ORDINALITY`） | `N + 3` | 503 | ≈ 3.7 KB | 65535 / 503 ≈ 130 倍 |
| 备选（`CASE` + `IN`） | `3N + 3` | 1503 | ≈ 16 KB | 65535 / 1503 ≈ 43 倍 |
| 备选（单数组参数 `$1::text[]`） | `4` | 4 | ≈ 0.3 KB | 余量最大，但依赖 Prisma 对 JS 数组的参数序列化行为，需先验证 |

即使把 `moveIssueSchema` 的 500 条上限放宽到 20000 条，`N + 3` 仍在协议范围内。

---

## 附录 B：备选方案 —— `CASE` + `IN`

若团队希望 SQL 尽可能「朴素可读」、不使用 `WITH ORDINALITY`，等价写法如下（参数 `3N + 3`）：

```ts
export function buildMoveIssueUpdateByCase(params: {
  fullOrder: readonly string[];
  toStatus: IssueStatusValue;
  workspaceId: string;
}): Prisma.Sql {
  // ⚠ 已实测：Prisma.join 的默认分隔符是 ","（无空格）。
  //   而 CASE 的 WHEN 分支之间**不能有逗号**，用默认值会生成
  //   `CASE "id" WHEN ? THEN ?,WHEN ? THEN ? ...` —— 直接语法错误。
  //   必须显式传 " " 作为分隔符。
  const branches = params.fullOrder.map(
    (id, index) => Prisma.sql`WHEN ${id} THEN ${index * 100}`
  );

  return Prisma.sql`
    UPDATE "Issue"
    SET
      "position"  = CASE "id" ${Prisma.join(branches, " ")} ELSE "position" END,
      "status"    = CASE "id" WHEN ${params.issueId} THEN ${params.toStatus}::"IssueStatus" ELSE "status" END,
      "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE "workspaceId" = ${params.workspaceId}
      AND "id" IN (${Prisma.join(params.fullOrder)})
  `;
}
```

**何时切到这个方案**：仅当明确拒绝 `WITH ORDINALITY` 时。取舍是——换来更「传统」的 SQL 外观，代价是参数与语句文本约 3–4 倍膨胀、多一个 `Prisma.join` 分隔符的坑，并且必须保留 `IN` 列表（否则 `ELSE "position"` 无法阻止并发插入的卡片被赋 `updatedAt`）。

---

## 附录 C：本方案明确不做的事

1. **源列 position 归一化**：被拖走的卡片在源列留下空洞（如 0, 100, 300）。归一化会引入对源列的整列重写——即把刚消除的 N+1 搬到源列，净收益为负。空列位置由 `ORDER BY position` 容忍，无需连续。
2. **`position` 步长改造**：维持 100。改成分数排序键（fractional indexing）是更彻底的方案（只写被移动的一张卡），但会改动 `position` 的类型与全部读写路径，属于独立议题，不应塞进这次热修。
3. **列表排序回退到 `updatedAt`**：见 §9.1 末段，无收益且需新增索引。
4. **`updatedAt` 语义变更**：作为可选后续（§9.1 选项 B）单开提交。
5. **`moveIssueSchema` 的 500 条上限调整**：本方案不依赖该上限，也不改变它。
6. **`Board.tsx` 的客户端排序逻辑**：`fullOrder` 的顺序来源不变。

---

## 附录 D：与其他评审项的关系

| 关联项 | 关系 |
|---|---|
| P1-3（四步契约重复） | 本方案会给 `lib/issues.ts` 引入一个纯函数导出，正好为 P1-3 抽 `withIssueAction()` 时的单测打底，建议先做本项 |
| P1-6（领域层零测试） | 本方案的 10.1 是 `lib/issues.ts` 的第一个单元测试，可作为补齐其余测试的模板 |
| P0-4（全量查询） | 二者共同决定看板规模上限。**建议顺序：先本项（P0-5），再 P0-4**。理由：P0-5 是「正常使用即失败」，P0-4 是「规模变大才变慢」；且 P0-4 会改变 UI 语义，需要更大改动面 |
| P2-3（批量创建 position 撞号） | 同属 position 语义问题，但改动点在 `lib/ai.ts`，与本方案无冲突，可并行 |
