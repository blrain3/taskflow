import "server-only";

import { Prisma } from "@prisma/client";

import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { isIssueStatus, type IssueItem, type IssueStatusValue } from "@/types/issue";

/**
 * Issue 数据访问与领域规则（docs/architecture.md §6 Issue 模块、§8.2 链路二）。
 *
 * 两条不可违反的规则：
 * 1. 所有查询/写入都必须带 workspaceId 过滤——这是数据隔离的唯一防线。
 * 2. 跨 Workspace 的操作不区分「不存在」与「无权限」，统一返回 NOT_FOUND，
 *    避免通过错误码探测他人数据是否存在。
 */

const ISSUE_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type IssueRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toIssueItem(row: IssueRow): IssueItem {
  if (!isIssueStatus(row.status)) {
    throw new AppError("INTERNAL", { detail: `数据库中出现了非法任务状态：${row.status}` });
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type IssueListMode = "list" | "board";

/**
 * 读取当前 Workspace 的任务。
 *
 * 两种视图的排序刻意不同，且都必须与数据库索引对齐（迁移见 prisma/migrations）：
 * - board：`status → position → createdAt`。position 是列内序；加 status 让扁平数组
 *   顺序确定（分组渲染不依赖它，但便于调试与分页）；position 相同的历史数据由 createdAt 兜底。
 * - list：`createdAt → id`。**不能用 updatedAt**——看板拖拽会重写整列 position，
 *   而 Prisma 的 @updatedAt 会因此刷新目标列所有卡片的 updatedAt，
 *   结果是「拖一张卡，整个目标列跳到列表顶部」，updatedAt 也不再代表「内容被修改」。
 *   列表排序走 createdAt 才能与 `@@index([workspaceId, createdAt])` 对应。
 */
export async function listIssues(
  workspaceId: string,
  mode: IssueListMode = "list"
): Promise<IssueItem[]> {
  const rows = await getPrisma().issue.findMany({
    where: { workspaceId },
    orderBy:
      mode === "board"
        ? [{ status: "asc" }, { position: "asc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    select: ISSUE_SELECT,
  });

  return rows.map(toIssueItem);
}

export type CreateIssueParams = {
  workspaceId: string;
  title: string;
  description?: string | null;
};

export async function createIssue(params: CreateIssueParams): Promise<IssueItem> {
  const row = await getPrisma().issue.create({
    data: {
      workspaceId: params.workspaceId,
      title: params.title,
      description: params.description ?? null,
      // 新建任务统一落到 BACKLOG，与 architecture §8.2 一致
      status: "BACKLOG",
    },
    select: ISSUE_SELECT,
  });

  return toIssueItem(row);
}

export type UpdateIssueParams = {
  workspaceId: string;
  id: string;
  title: string;
  description?: string | null;
  status: IssueStatusValue;
};

export async function updateIssue(params: UpdateIssueParams): Promise<void> {
  // 用 updateMany + count 而不是 update：id 与 workspaceId 同时作为条件，
  // 他人的任务天然不会命中，无需先查再判（少一次查询，也没有 TOCTOU 窗口）。
  const { count } = await getPrisma().issue.updateMany({
    where: { id: params.id, workspaceId: params.workspaceId },
    data: {
      title: params.title,
      description: params.description ?? null,
      status: params.status,
    },
  });

  if (count === 0) {
    throw new AppError("NOT_FOUND");
  }
}

export type DeleteIssueParams = {
  workspaceId: string;
  id: string;
};

export async function deleteIssue(params: DeleteIssueParams): Promise<void> {
  const { count } = await getPrisma().issue.deleteMany({
    where: { id: params.id, workspaceId: params.workspaceId },
  });

  if (count === 0) {
    throw new AppError("NOT_FOUND");
  }
}

export type MoveIssueParams = {
  workspaceId: string;
  issueId: string;
  toStatus: IssueStatusValue;
  /** 目标列的完整顺序（含被拖卡片），由客户端拖拽落点推导 */
  orderedIds: string[];
};

/**
 * 看板拖拽落库（P0-09）：单事务内完成「归属校验 → 改状态 → 整列重写 position」。
 *
 * 并发策略是整列快照覆盖（后写者赢）：
 * - 事务期间目标列新出现的卡片（别的标签页/设备创建或移入）不在 orderedIds 里，
 *   追加到列尾而不是丢弃，保证不产生「看不见的孤儿」；
 * - orderedIds 里不属于目标列的卡片（恶意或过期的清单）不参与重排，只能改它自己的顺序。
 */
export async function moveIssueWithinWorkspace(params: MoveIssueParams): Promise<void> {
  const uniqueIds = [...new Set(params.orderedIds)];
  if (!uniqueIds.includes(params.issueId)) {
    throw new AppError("VALIDATION_FAILED", { message: "排序列表缺少被移动的任务" });
  }

  await getPrisma().$transaction(async (tx) => {
    // 1. 归属校验：清单里任何一张卡不属于当前 Workspace，整体失败（不区分不存在与无权限）
    const ownedCount = await tx.issue.count({
      where: { id: { in: uniqueIds }, workspaceId: params.workspaceId },
    });
    if (ownedCount !== uniqueIds.length) {
      throw new AppError("NOT_FOUND");
    }

    // 2. 组出目标列的最终顺序：客户端清单在前，事务期间新出现的卡追加到列尾。
    //    appended 的顺序必须显式指定——不写 orderBy 时 Postgres 返回顺序是任意的，
    //    并发场景下会让列内顺序反复抖动。
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

    // 3. 被拖卡片改状态（列内排序时状态不变，重复写入无副作用）
    await tx.issue.updateMany({
      where: { id: params.issueId, workspaceId: params.workspaceId },
      data: { status: params.toStatus },
    });

    // 4. 整列重写 position（步长 100，为未来的无拖拽插入留中缝）
    for (let index = 0; index < fullOrder.length; index += 1) {
      await tx.issue.update({
        where: { id: fullOrder[index] },
        data: { position: index * 100 },
      });
    }
  });
}

/**
 * 构造「整列重写」的单条 UPDATE（P0-5 方案，见 docs/03-development/p0-5-move-issue-bulk-rewrite.md）。
 *
 * 抽成纯函数是为了能脱离数据库做单元测试：断言 Prisma.Sql 的 .sql 与 .values，
 * 即可验证序号、参数顺序与转型是否写对，无需真实数据库。
 *
 * 设计要点：
 * - 用 WITH ORDINALITY 把数组下标变成序号列，避免 N 个 CASE WHEN；
 * - 行集合由 JOIN 决定，恰为 fullOrder，不会误伤并发插入的卡片；
 * - 必须显式写 updatedAt：原始 SQL 不触发 Prisma 的 @updatedAt；
 *   且 "updatedAt" 是无时区的 TIMESTAMP(3)，故用 AT TIME ZONE 'UTC' 固定 UTC 墙钟，
 *   避免会话 TimeZone 非 UTC 时出现 8 小时偏移。
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
