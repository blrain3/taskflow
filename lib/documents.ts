import "server-only";

import type { DocumentContentFormat, Prisma } from "@prisma/client";

import { AppError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import type {
  CreateDocumentInput,
  RestoreDocumentVersionInput,
  SaveDocumentInput,
} from "@/lib/validation";
import {
  isDocumentFormat,
  isDocumentStatus,
  type DocumentFormatValue,
  type DocumentItem,
  type DocumentSummaryItem,
  type DocumentVersionItem,
} from "@/types/document";

/**
 * 文档数据访问与领域规则（ADR-007 第一阶段：单人写作 MVP）。
 *
 * 两条与 Issue 模块一致的不可违反规则：
 * 1. 所有查询/写入都必须带 workspaceId 过滤——这是数据隔离的唯一防线。
 * 2. 跨 Workspace 的操作不区分「不存在」与「无权限」，统一返回 NOT_FOUND，
 *    避免通过错误码探测他人数据是否存在。
 */

/** 列表投影：刻意不含 content。正文单条上限 20 万字符，列表带上正文会放大读、内存与 RSC 负载。 */
const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  title: true,
  summary: true,
  status: true,
  format: true,
  contentVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

/** 详情投影：编辑器需要正文。 */
const DOCUMENT_DETAIL_SELECT = {
  ...DOCUMENT_SUMMARY_SELECT,
  content: true,
} satisfies Prisma.DocumentSelect;

type DocumentSummaryRow = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  format: string;
  contentVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDocumentSummary(row: DocumentSummaryRow): DocumentSummaryItem {
  if (!isDocumentStatus(row.status)) {
    throw new AppError("INTERNAL", { detail: `数据库中出现了非法文档状态：${row.status}` });
  }
  if (!isDocumentFormat(row.format)) {
    throw new AppError("INTERNAL", { detail: `数据库中出现了非法文档格式：${row.format}` });
  }

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    format: row.format,
    contentVersion: row.contentVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDocumentItem(row: DocumentSummaryRow & { content: string }): DocumentItem {
  return { ...toDocumentSummary(row), content: row.content };
}

/**
 * 单次查询的硬上限（与 Issue 列表同源的过渡防线）。
 * 文档正文体积远大于任务标题，列表与版本历史都必须有界，否则 RSC 负载与 DOM 节点数随数据量线性膨胀。
 * 真正的分页（take + cursor 与「加载更多」）留作后续迭代。
 */
const DOCUMENT_LIST_HARD_CAP = 500;
const DOCUMENT_VERSION_HARD_CAP = 100;

export type DocumentWriteInput = Omit<CreateDocumentInput, "format"> & {
  workspaceId: string;
  userId: string;
  format: DocumentFormatValue;
};

export type DocumentSaveInput = Omit<SaveDocumentInput, "format"> & {
  workspaceId: string;
  userId: string;
  format: DocumentFormatValue;
};

export type DocumentRestoreInput = RestoreDocumentVersionInput & {
  workspaceId: string;
  userId: string;
};

/**
 * 新建文档并落一条初始版本。
 *
 * workspaceId 由调用方（Action）从会话推导后传入，绝不来自客户端；
 * 这里再校验一次成员身份，保证任何调用路径都不会写入他人工作区。
 */
export async function createDocument(input: DocumentWriteInput): Promise<DocumentItem> {
  const db = getPrisma();

  return db.$transaction(async (tx) => {
    const membership = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      select: { role: true },
    });
    if (!membership) throw new AppError("FORBIDDEN");

    const document = await tx.document.create({
      data: {
        workspaceId: input.workspaceId,
        authorId: input.userId,
        title: input.title,
        content: input.content,
        summary: input.summary ?? null,
        format: input.format as DocumentContentFormat,
      },
      select: DOCUMENT_DETAIL_SELECT,
    });

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        title: document.title,
        content: document.content,
        summary: document.summary,
        format: document.format,
        createdById: input.userId,
      },
    });

    return toDocumentItem(document);
  });
}

/**
 * 读取当前 Workspace 的文档列表。
 *
 * 前置条件：调用方（路由层）已用 requireWorkspaceContext 校验过工作区归属——与 listIssues 同一约定，
 * 因此这里不再重复一次成员查询。排序 `updatedAt → id` 与 `@@index([workspaceId, updatedAt, id])` 对齐。
 */
export async function listDocuments(workspaceId: string): Promise<DocumentSummaryItem[]> {
  const rows = await getPrisma().document.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: DOCUMENT_SUMMARY_SELECT,
    take: DOCUMENT_LIST_HARD_CAP,
  });

  return rows.map(toDocumentSummary);
}

/**
 * 保存正文（乐观并发控制）。
 *
 * 用 `updateMany` + `contentVersion = baseVersion` 做条件更新：并发提交时只有一个能命中，
 * 落败方拿到 CONFLICT，而不会覆盖别人的修改。命中后同事务写入一条新版本记录，
 * 版本号取更新后的 contentVersion，与「每次成功保存 +1」严格对应。
 */
export async function saveDocument(input: DocumentSaveInput): Promise<DocumentItem> {
  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.document.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: null,
        contentVersion: input.baseVersion,
      },
      data: {
        title: input.title,
        content: input.content,
        // 表单未提交 summary 时保持原值：编辑器当前不渲染该字段，
        // 若无条件写 null，任何一次保存都会把摘要静默清空。显式传空串才会被清空。
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        format: input.format as DocumentContentFormat,
        contentVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1)
      throw new AppError("CONFLICT", { message: "文档已被其他窗口修改，请刷新后重试" });

    const document = await tx.document.findUnique({
      where: { id: input.id },
      select: DOCUMENT_DETAIL_SELECT,
    });
    if (!document) throw new AppError("NOT_FOUND");

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        version: document.contentVersion,
        title: document.title,
        content: document.content,
        summary: document.summary,
        format: document.format,
        createdById: input.userId,
      },
    });

    return toDocumentItem(document);
  });
}

/**
 * 把历史版本恢复为当前内容。
 *
 * 恢复不是「回退指针」，而是把旧内容作为一次**新的正向修改**写回（版本号继续 +1），
 * 因此历史链条保持单调递增，不会出现版本号回退或被覆盖。
 */
export async function restoreDocumentVersion(input: DocumentRestoreInput): Promise<DocumentItem> {
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.document.findFirst({
      where: { id: input.documentId, workspaceId: input.workspaceId, deletedAt: null },
      select: { id: true, contentVersion: true },
    });
    if (!current) throw new AppError("NOT_FOUND");
    if (current.contentVersion !== input.baseVersion)
      throw new AppError("CONFLICT", { message: "文档已被其他窗口修改，请刷新后重试" });

    const source = await tx.documentVersion.findUnique({
      where: { documentId_version: { documentId: input.documentId, version: input.version } },
      select: { title: true, content: true, summary: true, format: true },
    });
    if (!source) throw new AppError("NOT_FOUND");

    const updated = await tx.document.updateMany({
      where: {
        id: input.documentId,
        workspaceId: input.workspaceId,
        deletedAt: null,
        contentVersion: input.baseVersion,
      },
      data: {
        title: source.title,
        content: source.content,
        summary: source.summary,
        format: source.format,
        contentVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new AppError("CONFLICT", { message: "文档已被其他窗口修改，请刷新后重试" });

    const document = await tx.document.findUnique({
      where: { id: input.documentId },
      select: DOCUMENT_DETAIL_SELECT,
    });
    if (!document) throw new AppError("NOT_FOUND");

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        version: document.contentVersion,
        title: document.title,
        content: document.content,
        summary: document.summary,
        format: document.format,
        createdById: input.userId,
      },
    });

    return toDocumentItem(document);
  });
}

/** 读取单篇文档；返回 null 表示「不存在或不属于该工作区」，由调用方转 404。 */
export async function getDocument(
  documentId: string,
  workspaceId: string
): Promise<DocumentItem | null> {
  const row = await getPrisma().document.findFirst({
    where: { id: documentId, workspaceId, deletedAt: null },
    select: DOCUMENT_DETAIL_SELECT,
  });

  return row ? toDocumentItem(row) : null;
}

/** 版本历史（倒序）。只返回元数据，不携带各版本正文。 */
export async function listDocumentVersions(
  documentId: string,
  workspaceId: string
): Promise<DocumentVersionItem[]> {
  const rows = await getPrisma().documentVersion.findMany({
    // 通过 relation 过滤工作区，避免仅凭 documentId 就能读到他人文档的版本历史
    where: { documentId, document: { workspaceId, deletedAt: null } },
    orderBy: [{ version: "desc" }],
    select: { id: true, version: true, title: true, createdById: true, createdAt: true },
    take: DOCUMENT_VERSION_HARD_CAP,
  });

  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** 软删除：保留行与版本历史，仅置 deletedAt 并归档，便于后续审计与恢复。 */
export async function deleteDocument(input: { id: string; workspaceId: string }): Promise<void> {
  const result = await getPrisma().document.updateMany({
    where: { id: input.id, workspaceId: input.workspaceId, deletedAt: null },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });

  if (result.count !== 1) throw new AppError("NOT_FOUND");
}
