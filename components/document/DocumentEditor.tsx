"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveDocumentAction } from "@/actions/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/ui/field-error";
import type { DocumentItem } from "@/types/document";

/** 停止输入后多久触发自动保存。 */
const AUTOSAVE_DELAY_MS = 1200;

export function DocumentEditor({ document }: { document: DocumentItem }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(saveDocumentAction, null);
  // revision 每次输入自增：既让防抖定时器随输入重置，也充当「内容是否已提交」的游标。
  const [revision, setRevision] = useState(0);
  // submittedRevision 是最近一次已交给服务端的 revision。自动保存只在 revision 超出它时触发，
  // 因此「保存完成 → pending 由 true 翻回 false」不会再次排一次提交——否则会退化成每隔
  // AUTOSAVE_DELAY_MS 写一次库的死循环（每次还会多插一条版本记录）。
  const [submittedRevision, setSubmittedRevision] = useState(0);

  const savedVersion =
    state?.ok && state.data ? state.data.contentVersion : document.contentVersion;
  const hasUnsavedChanges = revision !== submittedRevision;

  useEffect(() => {
    if (pending || revision === submittedRevision) return;

    const timer = window.setTimeout(() => {
      setSubmittedRevision(revision);
      formRef.current?.requestSubmit();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pending, revision, submittedRevision]);

  const markEdited = () => setRevision((current) => current + 1);

  let statusText = `已保存 · 版本 ${savedVersion}`;
  if (pending) statusText = "保存中…";
  else if (state && !state.ok) statusText = "保存失败，请重试";
  else if (hasUnsavedChanges) statusText = "未保存，停止输入后自动保存";

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={document.id} />
      <input type="hidden" name="baseVersion" value={savedVersion} />
      <input type="hidden" name="format" value={document.format} />
      <Input
        name="title"
        defaultValue={document.title}
        aria-label="文档标题"
        className="border-0 px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
        onChange={markEdited}
      />
      <Textarea
        name="content"
        defaultValue={document.content}
        rows={24}
        aria-label="文档正文"
        className="min-h-[32rem] resize-y font-mono text-sm leading-6"
        onChange={markEdited}
      />
      <FormError message={state && !state.ok ? state.error.message : undefined} />
      <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
        <span aria-live="polite">{statusText}</span>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "保存中…" : "立即保存"}
        </Button>
      </div>
    </form>
  );
}
