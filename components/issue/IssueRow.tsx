"use client";

import { useActionState, useState } from "react";

import { deleteIssueAction, updateIssueAction, type IssueFormState } from "@/actions/issue";
import { FieldError, FormError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_DESCRIPTION_MAX_LENGTH, ISSUE_TITLE_MAX_LENGTH } from "@/lib/validation";
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_STYLES,
  type IssueItem,
} from "@/types/issue";

const summaryClassName = "cursor-pointer text-xs text-fg-muted hover:text-fg";

/**
 * 单个任务：展示 + 行内编辑 + 行内删除确认。
 *
 * 用原生 <details>/<summary> 而不是受控弹窗，换来三件事：
 * 1. 没有服务端 JS 时依然可用（渐进增强）；
 * 2. 键盘可达、展开状态由浏览器维护，组件里不需要任何本地 state；
 * 3. 表单始终存在于 SSR 输出中，自动化测试可以直接提交它。
 *
 * 日期只取 ISO 的日期段，避免服务端与客户端本地化格式不一致导致 hydration 不匹配。
 */
export function IssueRow({ issue }: { issue: IssueItem }) {
  const [updateState, updateFormAction] = useActionState<IssueFormState, FormData>(
    updateIssueAction,
    null
  );
  const [deleteState, deleteFormAction] = useActionState<IssueFormState, FormData>(
    deleteIssueAction,
    null
  );

  const updateError = updateState && !updateState.ok ? updateState.error : null;
  const updateFields = updateError?.fields;
  const deleteError = deleteState && !deleteState.ok ? deleteState.error : null;
  const updateSucceeded = updateState?.ok === true;

  // 「已保存」只在保存成功后展示一次，重新展开编辑时清除，避免滞留成误导。
  // 用渲染期对齐（React 认可的 state 调整模式）记录「尚未被读过」的那次成功，
  // 不放进 effect——setState 在 effect 里同步调用会触发连锁渲染。
  const [unreadSaved, setUnreadSaved] = useState<IssueFormState>(null);
  if (updateState?.ok === true && unreadSaved !== updateState) {
    setUnreadSaved(updateState);
  }
  const savedVisible = updateState?.ok === true && unreadSaved === updateState;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ISSUE_STATUS_STYLES[issue.status]}`}
        >
          {ISSUE_STATUS_LABELS[issue.status]}
        </span>
        <span className="text-sm font-medium text-fg">{issue.title}</span>
      </div>

      {issue.description ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{issue.description}</p>
      ) : null}

      <p className="mt-1 text-xs text-fg-subtle">创建于 {issue.createdAt.slice(0, 10)}</p>

      <div className="mt-2 flex flex-wrap items-start gap-4">
        <details
          onToggle={(event) => {
            if ((event.target as HTMLDetailsElement).open) setUnreadSaved(null);
          }}
        >
          <summary className={summaryClassName} aria-label={`编辑「${issue.title}」`}>
            编辑
          </summary>

          <form
            id={`update-issue-form-${issue.id}`}
            action={updateFormAction}
            className="mt-3 space-y-3"
            noValidate
          >
            <input type="hidden" name="id" value={issue.id} />

            <div>
              <Label className="block" htmlFor={`title-${issue.id}`}>
                标题
              </Label>
              <Input
                id={`title-${issue.id}`}
                name="title"
                defaultValue={issue.title}
                required
                maxLength={ISSUE_TITLE_MAX_LENGTH}
                className="mt-1"
                aria-invalid={updateFields?.title ? true : undefined}
                aria-describedby={updateFields?.title ? `title-${issue.id}-error` : undefined}
              />
              <FieldError id={`title-${issue.id}-error`} message={updateFields?.title} />
            </div>

            <div>
              <Label className="block" htmlFor={`description-${issue.id}`}>
                描述
              </Label>
              <Textarea
                id={`description-${issue.id}`}
                name="description"
                rows={3}
                maxLength={ISSUE_DESCRIPTION_MAX_LENGTH}
                defaultValue={issue.description ?? ""}
                className="mt-1"
                aria-invalid={updateFields?.description ? true : undefined}
                aria-describedby={
                  updateFields?.description ? `description-${issue.id}-error` : undefined
                }
              />
              <FieldError
                id={`description-${issue.id}-error`}
                message={updateFields?.description}
              />
            </div>

            <div>
              <Label className="block" htmlFor={`status-${issue.id}`}>
                状态
              </Label>
              <select
                id={`status-${issue.id}`}
                name="status"
                defaultValue={issue.status}
                className="mt-1 block h-9 w-full rounded-md border border-line-strong bg-raised px-3 py-2 text-sm text-fg"
                aria-invalid={updateFields?.status ? true : undefined}
                aria-describedby={updateFields?.status ? `status-${issue.id}-error` : undefined}
              >
                {ISSUE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ISSUE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <FieldError id={`status-${issue.id}-error`} message={updateFields?.status} />
            </div>

            <FormError message={updateError && !updateFields ? updateError.message : undefined} />

            {updateSucceeded && savedVisible ? (
              <p className="text-sm text-success" role="status">
                已保存
              </p>
            ) : null}

            <SubmitButton pendingText="保存中…">保存</SubmitButton>
          </form>
        </details>

        <details>
          <summary
            className={`${summaryClassName} text-danger hover:opacity-80`}
            aria-label={`删除「${issue.title}」`}
          >
            删除
          </summary>

          <div className="mt-3 space-y-2">
            <p className="text-sm text-fg-muted">确定删除「{issue.title}」？该操作不可撤销。</p>
            <FormError message={deleteError?.message} />

            <form
              id={`delete-issue-form-${issue.id}`}
              action={deleteFormAction}
              className="flex gap-2"
            >
              <input type="hidden" name="id" value={issue.id} />
              <SubmitButton variant="ghost" className="text-danger" pendingText="删除中…">
                确认删除
              </SubmitButton>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}
