"use client";

import { useActionState } from "react";

import { deleteDocumentAction } from "@/actions/document";
import { FormError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * 文档删除入口（列表行内）。
 *
 * 与 Issue 的删除交互保持一致：用原生 `<details>/<summary>` 承载二次确认，换来三点——
 * 无 JS 时仍可展开并提交、键盘可达且展开状态由浏览器维护（组件无需本地 state）、
 * 表单始终存在于 SSR 输出中便于自动化测试。
 *
 * 删除后的刷新与状态更新由服务端完成：Action 内 `revalidatePath("/documents")` 会让当前
 * 路由重新渲染，被删文档因 `deletedAt: null` 过滤而自然消失，因此这里不需要额外的
 * `router.refresh()`；失败（NOT_FOUND 等）通过 FormError 就地呈现，不会静默。
 */
export function DeleteDocumentForm({ documentId, title }: { documentId: string; title: string }) {
  const [state, formAction] = useActionState(deleteDocumentAction, null);

  return (
    <details className="shrink-0">
      <summary
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-danger hover:bg-hover"
        aria-label={`删除「${title}」`}
      >
        删除
      </summary>

      <div className="mt-2 w-64 space-y-2 text-left">
        <p className="text-xs text-fg-muted">
          确定删除「{title}」？删除后该文档会从列表移除并归档，历史版本仍会保留。
        </p>

        <FormError message={state && !state.ok ? state.error.message : undefined} />

        <form
          id={`delete-document-form-${documentId}`}
          action={formAction}
          className="flex justify-end"
        >
          <input type="hidden" name="id" value={documentId} />
          <SubmitButton variant="ghost" className="text-xs text-danger" pendingText="删除中…">
            确认删除
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
