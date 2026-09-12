"use client";

import { useActionState, useEffect, useRef } from "react";

import { createIssueAction, type IssueFormState } from "@/actions/issue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { ISSUE_DESCRIPTION_MAX_LENGTH, ISSUE_TITLE_MAX_LENGTH } from "@/lib/validation";

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
        <Label className="block" htmlFor="issue-title">
          任务标题
        </Label>
        <Input
          id="issue-title"
          name="title"
          required
          maxLength={ISSUE_TITLE_MAX_LENGTH}
          placeholder="要做什么？"
          aria-invalid={fields?.title ? true : undefined}
          aria-describedby={fields?.title ? "issue-title-error" : undefined}
        />
        <FieldError id="issue-title-error" message={fields?.title} />
      </div>

      <div>
        <Label className="block" htmlFor="issue-description">
          描述（可选）
        </Label>
        <Textarea
          id="issue-description"
          name="description"
          rows={3}
          maxLength={ISSUE_DESCRIPTION_MAX_LENGTH}
          placeholder="补充背景、验收条件等"
          className="mt-1"
          aria-invalid={fields?.description ? true : undefined}
          aria-describedby={fields?.description ? "issue-description-error" : undefined}
        />
        <FieldError id="issue-description-error" message={fields?.description} />
      </div>

      <FormError message={error && !fields ? error.message : undefined} />

      <SubmitButton className="w-full sm:w-auto" pendingText="创建中…">
        创建任务
      </SubmitButton>
    </form>
  );
}
