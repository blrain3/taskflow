"use server";

import { authorizeDefaultWorkspace, ROUTES, runAction } from "@/actions/_contract";
import { createIssuesFromSubtasks } from "@/lib/issue-batch";
import { createIssue, deleteIssue, moveIssueWithinWorkspace, updateIssue } from "@/lib/issues";
import {
  createIssuesFromSubtasksSchema,
  createIssueSchema,
  deleteIssueSchema,
  moveIssueSchema,
  updateIssueSchema,
  type MoveIssueInput,
} from "@/lib/validation";
import type { ActionResult } from "@/types/action";
import type { IssueItem } from "@/types/issue";

/**
 * Issue 变更入口（docs/02-architecture/architecture.md §8.2）。
 *
 * 四步契约（Zod 校验 → 鉴权 → 授权 → 写库 + 失效缓存）由 `actions/_contract.ts` 的
 * `runAction` 统一执行，本文件只声明「每个入口的入参形状、授权上下文与业务动作」。
 * 这样新增入口时不可能漏掉鉴权或 revalidatePath（架构评审 P1-3）。
 *
 * 授权一律走 `authorizeDefaultWorkspace`：Issue 契约里不含 workspaceId，
 * 客户端无从传入，只能由服务端从会话推导。
 */

/** 表单型入口的校验失败文案 */
const ISSUE_VALIDATION_MESSAGE = "请检查填写内容";
/** 批量创建入口的校验失败文案（与单条创建刻意区分，便于用户定位问题） */
const SUBTASK_VALIDATION_MESSAGE = "请检查子任务内容";

export type IssueFormState = ActionResult<IssueItem | null> | null;

function readString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

export async function createIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  return runAction({
    schema: createIssueSchema,
    rawInput: {
      title: readString(formData, "title") ?? "",
      description: readString(formData, "description"),
    },
    validationMessage: ISSUE_VALIDATION_MESSAGE,
    authorize: authorizeDefaultWorkspace,
    run: (input, auth) =>
      createIssue({
        workspaceId: auth.workspaceId,
        title: input.title,
        description: input.description,
      }),
    revalidate: () => [ROUTES.issues],
  });
}

export async function updateIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  return runAction({
    schema: updateIssueSchema,
    rawInput: {
      id: readString(formData, "id") ?? "",
      title: readString(formData, "title") ?? "",
      description: readString(formData, "description"),
      status: readString(formData, "status") ?? "",
    },
    validationMessage: ISSUE_VALIDATION_MESSAGE,
    authorize: authorizeDefaultWorkspace,
    run: async (input, auth) => {
      await updateIssue({
        workspaceId: auth.workspaceId,
        id: input.id,
        title: input.title,
        description: input.description,
        status: input.status,
      });
      return null;
    },
    revalidate: () => [ROUTES.issues],
  });
}

export async function deleteIssueAction(
  _prevState: IssueFormState,
  formData: FormData
): Promise<IssueFormState> {
  return runAction({
    schema: deleteIssueSchema,
    rawInput: { id: readString(formData, "id") ?? "" },
    validationMessage: ISSUE_VALIDATION_MESSAGE,
    authorize: authorizeDefaultWorkspace,
    run: async (input, auth) => {
      await deleteIssue({ workspaceId: auth.workspaceId, id: input.id });
      return null;
    },
    revalidate: () => [ROUTES.issues],
  });
}

/**
 * 看板拖拽（P0-09）。与三个表单型入口不同，这里由客户端 JS 直调（拖拽天然依赖 JS，
 * 不存在渐进增强通道），入参是普通对象而不是 FormData；四步契约不变。
 */
export async function moveIssue(input: MoveIssueInput): Promise<ActionResult<null>> {
  return runAction({
    schema: moveIssueSchema,
    rawInput: input,
    validationMessage: ISSUE_VALIDATION_MESSAGE,
    authorize: authorizeDefaultWorkspace,
    run: async (parsed, auth) => {
      await moveIssueWithinWorkspace({
        workspaceId: auth.workspaceId,
        issueId: parsed.issueId,
        toStatus: parsed.toStatus,
        orderedIds: parsed.orderedIds,
      });
      return null;
    },
    revalidate: () => [ROUTES.issues],
  });
}

/**
 * AI 确认后批量创建（US-008 / P0-11）。同样由 JS 直调。
 * $transaction 保证全成功或全失败；requestId 提供幂等（重复提交不产生重复任务）。
 */
export async function createIssuesFromSubtasksAction(
  input: unknown
): Promise<ActionResult<{ createdCount: number; duplicate: boolean }>> {
  return runAction({
    schema: createIssuesFromSubtasksSchema,
    rawInput: input,
    validationMessage: SUBTASK_VALIDATION_MESSAGE,
    authorize: authorizeDefaultWorkspace,
    run: (parsed, auth) =>
      createIssuesFromSubtasks({
        workspaceId: auth.workspaceId,
        requestId: parsed.requestId,
        subtasks: parsed.subtasks,
      }),
    revalidate: () => [ROUTES.issues],
  });
}
