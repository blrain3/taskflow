import "server-only";

import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

export type DocumentPermission = "read" | "edit" | "restore";

export type AccessibleDocument = {
  id: string;
  workspaceId: string;
};

/**
 * 校验用户是否有权访问某篇文档，并返回该文档的归属信息。
 *
 * 契约：**返回值里的 workspaceId 就是后续读写必须使用的工作区**。
 * 不要把它丢掉、再用「当前会话的工作区」去写库——授权判定与写入范围必须是同一个工作区，
 * 否则一旦用户同时属于多个工作区，就会变成「按 A 授权、往 B 写」的越权形状。
 *
 * 角色规则：read 只要求是成员；edit / restore 要求 OWNER 或 EDITOR。第一阶段没有只读邀请流程，
 * 先按最小可用规则收口，等成员邀请落地后再引入更细的权限矩阵。
 *
 * 跨 Workspace 不区分「文档不存在」与「无权限」的存在性：两者返回的错误码不同，
 * 但都不携带任何文档内容，因此不构成内容探测。
 */
export async function assertDocumentAccess(
  userId: string,
  documentId: string,
  permission: DocumentPermission = "read"
): Promise<AccessibleDocument> {
  const document = await getPrisma().document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, workspaceId: true },
  });
  if (!document) throw new AppError("NOT_FOUND");

  const membership = await getPrisma().workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: document.workspaceId, userId } },
    select: { role: true },
  });
  if (!membership) throw new AppError("FORBIDDEN");

  if (permission !== "read" && membership.role !== "OWNER" && membership.role !== "EDITOR") {
    throw new AppError("FORBIDDEN");
  }

  return document;
}
