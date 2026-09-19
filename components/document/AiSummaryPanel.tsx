"use client";

import { useActionState, useState } from "react";

import { applyDocumentSummaryAction } from "@/actions/document";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/types/action";

type SummarizeState = ActionResult<{ summary: string }> | null;

/**
 * AI 摘要面板（ADR-007 P1：根据正文生成摘要，确认后写入文档摘要字段）。
 *
 * 生成与写库刻意拆成两步（architecture.md §6「AI 只产出、不写库」）：
 * 1. 「生成摘要」走 /api/ai/summarize（Route Handler），产出建议但不落库；
 * 2. 建议先展示，用户点「写入文档摘要」才经 Server Action 落库。
 *
 * 写入不递增 contentVersion（摘要属元数据，见 lib/documents.ts applyDocumentSummary），
 * 因此这一步不会让编辑器正在持有的乐观锁失效——否则下一次自动保存必然 CONFLICT。
 */
export function AiSummaryPanel({ documentId }: { documentId: string }) {
  const [state, formAction] = useActionState(applyDocumentSummaryAction, null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const applied = state?.ok && state.data ? state.data.summary : null;

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const payload = (await response.json()) as SummarizeState;
      if (!payload || !payload.ok) {
        setGenerateError(payload?.error.message ?? "生成失败，请稍后重试");
        return;
      }
      setSuggestion(payload.data.summary);
    } catch {
      setGenerateError("网络异常，请稍后重试");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section aria-labelledby="ai-summary-heading" className="rounded-lg border border-line p-4">
      <h2 id="ai-summary-heading" className="text-sm font-medium text-fg">
        AI 摘要
      </h2>

      <div className="mt-3 space-y-3">
        {applied ? (
          <p className="text-xs text-success" role="status">
            已写入文档摘要：{applied}
          </p>
        ) : null}

        {suggestion ? (
          <blockquote
            aria-label="AI 生成的摘要建议"
            className="rounded-md bg-hover px-3 py-2 text-sm leading-6 text-fg"
          >
            {suggestion}
          </blockquote>
        ) : (
          <p className="text-xs text-fg-muted">
            根据正文生成一段摘要建议；生成不会改动正文，确认后才写入。
          </p>
        )}

        {generateError ? <FormError message={generateError} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中…" : suggestion ? "重新生成" : "生成摘要"}
          </Button>

          {suggestion ? (
            <form action={formAction}>
              <input type="hidden" name="documentId" value={documentId} />
              <input type="hidden" name="summary" value={suggestion} />
              <SubmitButton pendingText="写入中…">写入文档摘要</SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}
