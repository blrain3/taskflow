"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { toActionError } from "@/lib/errors";
import { createIssue, deleteIssue, updateIssue } from "@/lib/issues";
import { ensureWorkspaceForUser } from "@/lib/permissions";
import {
  createIssueSchema,
  deleteIssueSchema,
  fieldErrorsOf,
  updateIssueSchema,
} from "@/lib/validation";
import type { ActionError, ActionResult } from "@/types/action";
import type { IssueItem } from "@/types/issue";

/**
 * Issue 变更入口（docs/architecture.md §7.2）。
 *
 * 每个 Action 固定四步，缺一不可：
 *   1) Zod 校验入参
 *   2) 鉴权：requireUser()，未登录直接 UNAUTHORIZED
 *   3) 授权：workspaceId 由服务端推导（ensureWorkspaceForUser），绝不信任客户端入参
 *   4) 写库 + revalidatePath() 让 RSC 重新读取
 *
 * 注意：这里刻意不复用 lib/permissions.ts 的 requireWorkspaceContext——
 * 那个函数用 React cache() 按请求去重，是给渲染期用的；Action 里直接走基础函数更直白。
 */

const ISSUES_PATH = "/issues";

export type IssueFormState = ActionResult<IssueItem | null> | null;

function failure(error: ActionError): IssueFormState {
  return { ok: false, error };
}

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

/** 第 2、3 步：鉴权 + 推导当前 Workspace（即授权边界） */
async function resolveWorkspace() {
  const user = await requireUser();
  return ensureWorkspaceForUser(user.id, user.name);
}

export async function createIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  const parsed = createIssueSchema.safeParse({
    title: readString(formData, "title") ?? "",
    description: readString(formData, "description"),
  });

  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查填写内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const workspace = await resolveWorkspace();
    const issue = await createIssue({
      workspaceId: workspace.id,
      title: parsed.data.title,
      description: parsed.data.description,
    });

    revalidatePath(ISSUES_PATH);
    return { ok: true, data: issue };
  } catch (error) {
    return failure(toActionError(error));
  }
}

export async function updateIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  const parsed = updateIssueSchema.safeParse({
    id: readString(formData, "id") ?? "",
    title: readString(formData, "title") ?? "",
    description: readString(formData, "description"),
    status: readString(formData, "status") ?? "",
  });

  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查填写内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const workspace = await resolveWorkspace();
    await updateIssue({
      workspaceId: workspace.id,
      id: parsed.data.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
    });

    revalidatePath(ISSUES_PATH);
    return { ok: true, data: null };
  } catch (error) {
    return failure(toActionError(error));
  }
}

export async function deleteIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  const parsed = deleteIssueSchema.safeParse({
    id: readString(formData, "id") ?? "",
  });

  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查填写内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  try {
    const workspace = await resolveWorkspace();
    await deleteIssue({ workspaceId: workspace.id, id: parsed.data.id });

    revalidatePath(ISSUES_PATH);
    return { ok: true, data: null };
  } catch (error) {
    return failure(toActionError(error));
  }
}
