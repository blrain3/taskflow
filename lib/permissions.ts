import "server-only";

import type { WorkspaceRole } from "@prisma/client";
import { cache } from "react";

import type { AuthedUser } from "@/lib/auth";
import { requireUserOrRedirect } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

/**
 * Workspace 归属判定与初始化（docs/02-architecture/architecture.md §6 Workspace 模块）。
 *
 * 铁律：workspaceId 一律由服务端推导或校验，绝不信任客户端传入的值。
 */

export type WorkspaceSummary = {
  id: string;
  name: string;
  /**
   * 成员角色。类型取自 Prisma 生成的枚举而非裸 string——
   * 角色是授权判定依据（文档域 edit / restore 要求 OWNER 或 EDITOR），
   * 用裸 string 会让拼写错误在编译期静默通过（架构评审 P1-8）。
   */
  role: WorkspaceRole;
};

const DEFAULT_WORKSPACE_NAME = "我的工作区";
const WORKSPACE_NAME_MAX_LENGTH = 50;

function defaultWorkspaceName(displayName?: string | null): string {
  const base = displayName?.trim();
  if (!base) return DEFAULT_WORKSPACE_NAME;

  const candidate = `${base} 的工作区`;
  return candidate.length <= WORKSPACE_NAME_MAX_LENGTH
    ? candidate
    : candidate.slice(0, WORKSPACE_NAME_MAX_LENGTH);
}

/** 每个用户的「默认工作区」使用确定性 ID，使并发创建天然收敛到同一条记录 */
function defaultWorkspaceId(userId: string): string {
  return `ws_default_${userId}`;
}

function toSummary(row: {
  role: WorkspaceRole;
  workspace: { id: string; name: string };
}): WorkspaceSummary {
  return { id: row.workspace.id, name: row.workspace.name, role: row.role };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function findExistingWorkspace(userId: string): Promise<WorkspaceSummary | null> {
  const existing = await getPrisma().workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });

  return existing ? toSummary(existing) : null;
}

/**
 * 返回用户最早加入的 Workspace；一个都没有时创建默认 Workspace 并写入成员关系。
 * 对应 US-002：首次进入 Dashboard 时自动初始化。
 *
 * 并发安全（曾出过 bug）：Next 会并发渲染 layout 与 page，若两个分支同时发现「没有工作区」
 * 就会各建一个。这里用「确定性 ID + upsert + 唯一冲突兜底」保证无论并发多少次，
 * 结果都只会有一条工作区记录。
 */
export async function ensureWorkspaceForUser(
  userId: string,
  displayName?: string | null
): Promise<WorkspaceSummary> {
  const existing = await findExistingWorkspace(userId);
  if (existing) return existing;

  const db = getPrisma();
  const workspaceId = defaultWorkspaceId(userId);

  try {
    return await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.upsert({
        where: { id: workspaceId },
        update: {},
        create: { id: workspaceId, name: defaultWorkspaceName(displayName), ownerId: userId },
        select: { id: true, name: true },
      });

      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
        update: {},
        create: { workspaceId: workspace.id, userId, role: "OWNER" },
      });

      return { ...workspace, role: "OWNER" };
    });
  } catch (error) {
    // 并发写入撞上唯一约束时，说明另一个请求已经建好，直接读回即可
    if (isUniqueViolation(error)) {
      const retried = await findExistingWorkspace(userId);
      if (retried) return retried;
    }
    throw error;
  }
}

/**
 * 校验用户是否属于该 Workspace；不属于则抛 FORBIDDEN。
 * 所有涉及 workspaceId 的写操作，在鉴权之后、写库之前调用。
 */
export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<WorkspaceSummary> {
  const membership = await getPrisma().workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });

  if (!membership) {
    throw new AppError("FORBIDDEN");
  }

  return toSummary(membership);
}

export type WorkspaceContext = {
  user: AuthedUser;
  workspace: WorkspaceSummary;
};

/**
 * 受保护页面/布局的统一入口：校验会话并解析出当前 Workspace。
 * 未登录会跳转登录页，不会返回 null。
 *
 * 用 React cache() 按请求去重：layout 与 page 会并发执行，若不缓存就会把
 * ensureWorkspaceForUser 跑两遍（曾因此产生重复工作区）。
 */
export const requireWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const user = await requireUserOrRedirect();
  const workspace = await ensureWorkspaceForUser(user.id, user.name);
  return { user, workspace };
});
