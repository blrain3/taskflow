"use client";

import { useActionState, useEffect, useRef } from "react";

import { createIssueAction, type IssueFormState } from "@/actions/issue";
import { FieldError, FormError } from "@/components/ui/field-error";
import { Input, inputClassName } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/** 创建任务表单（US-003）。成功后清空输入，失败时保留用户已填内容。 */
export function IssueForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<IssueFormState, FormData>(createIssueAction, null);

  const error = state && !state.ok ? state.error : null;
  const fields = error?.fields;

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form id="create-issue-form" ref={formRef} action={formAction} className="space-y-3" noValidate>
      <div>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="issue-title">
          任务标题
        </label>
        <Input
          id="issue-title"
          name="title"
          required
          maxLength={200}
          placeholder="要做什么？"
          aria-invalid={fields?.title ? true : undefined}
        />
        <FieldError message={fields?.title} />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="issue-description">
          描述（可选）
        </label>
        <textarea
          id="issue-description"
          name="description"
          rows={3}
          maxLength={2000}
          placeholder="补充背景、验收条件等"
          className={inputClassName}
          aria-invalid={fields?.description ? true : undefined}
        />
        <FieldError message={fields?.description} />
      </div>

      <FormError message={error && !fields ? error.message : undefined} />

      <SubmitButton className="w-full sm:w-auto" pendingText="创建中…">
        创建任务
      </SubmitButton>
    </form>
  );
}
