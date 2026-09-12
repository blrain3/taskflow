import "server-only";

import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import type { GeneratedSubtask } from "@/types/issue";

/**
 * AI 子任务的批量事务创建（P0-11）。
 *
 * 为什么独立于 lib/ai.ts：AI 模块的职责边界是「产出并校验子任务，不写库」
 * （architecture.md §6）——写库策略（幂等、冲突、position 分配）是独立的关注点，
 * 混在一起会让 AI 模块背上第二个变化原因，也让它的单测必须连 Prisma 一起 mock。
 *
 * 幂等设计（不改 Schema，保持 ADR 冻结的六表模型）：
 * 用客户端提供的 requestId 推导确定性主键 `<workspaceId>:<requestId>:<index>`。
 * 主键带上 workspaceId 是安全铁律的要求（lib/issues.ts §头注释）：
 * 错误码不得泄露「其它 Workspace 是否存在某批次」——若主键只由 requestId 决定，
 * 「撞 CONFLICT」与「创建成功」就成了可探测他人数据存在性的通道；带上 workspaceId
 * 后跨 Workspace 冲突在结构上不可能发生。由此：
 * - 重复提交同一批次：主键已存在 → 直接返回既有结果，不产生重复任务；
 * - 并发重复提交：落败方撞 P2002 → 读回既有结果返回，不报错；
 * - 事务中途失败：整批回滚，下次重试仍按同一批主键创建，不留半成品。
 */

export type BatchCreateResult = {
  createdCount: number;
  /** true 表示这次请求命中了幂等键，未产生新数据 */
  duplicate: boolean;
};

const BACKLOG_COLUMN = "BACKLOG" as const;
const POSITION_STEP = 100;

export async function createIssuesFromSubtasks(params: {
  workspaceId: string;
  requestId: string;
  subtasks: GeneratedSubtask[];
}): Promise<BatchCreateResult> {
  const ids = params.subtasks.map(
    (_, index) => `${params.workspaceId}:${params.requestId}:${index}`
  );
  const db = getPrisma();

  try {
    return await db.$transaction(async (tx) => {
      const existingCount = await tx.issue.count({
        where: { id: { in: ids }, workspaceId: params.workspaceId },
      });

      if (existingCount === ids.length) {
        return { createdCount: ids.length, duplicate: true };
      }
      if (existingCount > 0) {
        // 半批次存在理论上不会出现（事务原子性）；真出现就拒绝，避免产生难以追踪的数据
        throw new AppError("CONFLICT", { message: "该批次数据不完整，请刷新列表后重试" });
      }

      // position 落在本列已有最大值之后：否则与老数据同号，新任务在列内无序散落
      const columnMax = await tx.issue.aggregate({
        _max: { position: true },
        where: { workspaceId: params.workspaceId, status: BACKLOG_COLUMN },
      });
      const basePosition =
        columnMax._max.position === null ? 0 : columnMax._max.position + POSITION_STEP;

      for (let index = 0; index < params.subtasks.length; index += 1) {
        const item = params.subtasks[index];
        await tx.issue.create({
          data: {
            id: ids[index],
            workspaceId: params.workspaceId,
            title: item.title,
            description: item.description ?? null,
            status: BACKLOG_COLUMN,
            position: basePosition + index * POSITION_STEP,
          },
        });
      }

      return { createdCount: params.subtasks.length, duplicate: false };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;

    // 并发落败方读回本批次结果，避免把 500 抛给用户；计数不足说明撞上了
    // 其它批次的异常状态，按 CONFLICT 拒绝而不是静默混入
    if (isUniqueViolation(error)) {
      const count = await db.issue.count({
        where: { id: { in: ids }, workspaceId: params.workspaceId },
      });
      if (count === ids.length) {
        return { createdCount: ids.length, duplicate: true };
      }
      throw new AppError("CONFLICT", { message: "该批次标识已被占用，请重新生成子任务" });
    }

    throw error;
  }
}
