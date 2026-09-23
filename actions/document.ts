"use server";

import { revalidatePath } from "next/cache";

import { ROUTES, runAction } from "@/actions/_contract";
import { requireUser } from "@/lib/auth";
import { assertDocumentAccess } from "@/lib/document-permissions";
import {
  applyDocumentSummary,
  createDocument,
  deleteDocument,
  restoreDocumentVersion,
  saveDocument,
} from "@/lib/documents";
import { toActionError } from "@/lib/errors";
import { ensureWorkspaceForUser } from "@/lib/permissions";
import {
  applyDocumentSummarySchema,
  createDocumentSchema,
  fieldErrorsOf,
  restoreDocumentVersionSchema,
  saveDocumentSchema,
} from "@/lib/validation";
import type { ActionError, ActionResult } from "@/types/action";

/**
 * 文档写操作（ADR-007 第一阶段）。
 *
 * 统一沿用四步契约：Zod 校验 → 鉴权（会话）→ 授权（工作区归属）→ 写库 + revalidatePath。
 *
 * 关于工作区：**所有写库用的 workspaceId 都取自 assertDocumentAccess 的返回值**，
 * 即「文档实际所属的那个工作区」，而不是会话默认工作区。两者必须同源，
 * 否则一旦用户属于多个工作区，授权判定与写入范围就会错位（按 A 授权、往 B 写）。
 */

const DOCUMENTS_PATH = ROUTES.documents;

/** 各入口的返回数据形状不同：保存回传新版本号，摘要写入回传已落库的摘要文本（null 即已清空） */
type DocumentActionData = null | { contentVersion: number } | { summary: string | null };

type DocumentActionState = ActionResult<DocumentActionData> | null;

function failure(error: ActionError): { ok: false; error: ActionError } {
  return { ok: false, error };
}

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

/** 表单未提交该字段时返回 undefined（保持原值），而不是 null（显式清空）。 */
function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value === null ? undefined : value;
}

function readNumber(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

export async function createDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const parsed = createDocumentSchema.safeParse({
    title: readString(formData, "title") ?? "",
    content: readString(formData, "content") ?? "",
    summary: readOptionalString(formData, "summary"),
    format: readString(formData, "format") ?? "MARKDOWN",
  });
  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查文档内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const user = await requireUser();
    // 新建时文档还不存在，工作区只能由服务端推导——客户端传入的值一律不参与写入
    const workspace = await ensureWorkspaceForUser(user.id, user.name);

    await createDocument({ ...parsed.data, workspaceId: workspace.id, userId: user.id });
    revalidatePath(DOCUMENTS_PATH);
    return { ok: true, data: null };
  } catch (error) {
    return failure(toActionError(error));
  }
}

export async function saveDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const parsed = saveDocumentSchema.safeParse({
    id: readString(formData, "id") ?? "",
    title: readString(formData, "title") ?? "",
    content: readString(formData, "content") ?? "",
    summary: readOptionalString(formData, "summary"),
    format: readString(formData, "format") ?? "MARKDOWN",
    baseVersion: readNumber(formData, "baseVersion"),
  });
  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查文档内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const user = await requireUser();
    const target = await assertDocumentAccess(user.id, parsed.data.id, "edit");

    const document = await saveDocument({
      ...parsed.data,
      workspaceId: target.workspaceId,
      userId: user.id,
    });

    revalidatePath(DOCUMENTS_PATH);
    revalidatePath(ROUTES.documentDetail(target.id));
    return { ok: true, data: { contentVersion: document.contentVersion } };
  } catch (error) {
    return failure(toActionError(error));
  }
}

export async function deleteDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const id = readString(formData, "id") ?? "";
  if (!id) return failure({ code: "VALIDATION_FAILED", message: "缺少文档 ID" });

  try {
    const user = await requireUser();
    const target = await assertDocumentAccess(user.id, id, "edit");

    // 软删除：行与版本历史保留；详情页会因 deletedAt 过滤而 404，所以要一并失效
    await deleteDocument({ id: target.id, workspaceId: target.workspaceId });

    revalidatePath(DOCUMENTS_PATH);
    revalidatePath(ROUTES.documentDetail(target.id));
    return { ok: true, data: null };
  } catch (error) {
    return failure(toActionError(error));
  }
}

export async function restoreDocumentVersionAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const parsed = restoreDocumentVersionSchema.safeParse({
    documentId: readString(formData, "documentId") ?? "",
    version: readNumber(formData, "version"),
    baseVersion: readNumber(formData, "baseVersion"),
  });
  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "版本参数不合法",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const user = await requireUser();
    const target = await assertDocumentAccess(user.id, parsed.data.documentId, "restore");

    const restored = await restoreDocumentVersion({
      ...parsed.data,
      workspaceId: target.workspaceId,
      userId: user.id,
    });

    revalidatePath(DOCUMENTS_PATH);
    revalidatePath(ROUTES.documentDetail(target.id));
    // 恢复是一次正向写入，服务端已把 contentVersion 递增（lib/documents.ts 的
    // restoreDocumentVersion 里 updateMany 带 increment: 1）。不回传的话编辑器
    // 状态行会停留在旧版本号，表现为「恢复了但版本没变」。
    return { ok: true, data: { contentVersion: restored.contentVersion } };
  } catch (error) {
    return failure(toActionError(error));
  }
}

/**
 * 写入 AI 摘要（用户在面板上点「写入文档摘要」之后才会调用）。
 *
 * 生成（/api/ai/summarize）与写库刻意拆开：AI 建议先展示给用户，采纳才落库，
 * 因此建议在被采纳前不会污染文档。摘要属元数据，不递增 contentVersion
 * （见 lib/documents.ts 的 applyDocumentSummary 说明）。
 */
export async function applyDocumentSummaryAction(
  _prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const result = await runAction({
    schema: applyDocumentSummarySchema,
    rawInput: {
      documentId: readString(formData, "documentId") ?? "",
      summary: readOptionalString(formData, "summary") ?? null,
    },
    validationMessage: "摘要参数不合法",
    authorize: async (input) => {
      const user = await requireUser();
      // 授权与写入同源：写库用文档实际所属的工作区
      const target = await assertDocumentAccess(user.id, input.documentId, "edit");
      return { workspaceId: target.workspaceId, documentId: target.id };
    },
    run: (input, auth) =>
      applyDocumentSummary({
        documentId: auth.documentId,
        workspaceId: auth.workspaceId,
        summary: input.summary,
      }),
    revalidate: (_output, auth) => [DOCUMENTS_PATH, ROUTES.documentDetail(auth.documentId)],
  });

  if (!result.ok) return result;
  return { ok: true, data: { summary: result.data.summary } };
}
