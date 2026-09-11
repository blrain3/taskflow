import "server-only";

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

export async function listIssues(workspaceId: string): Promise<IssueItem[]> {
  const rows = await getPrisma().issue.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
