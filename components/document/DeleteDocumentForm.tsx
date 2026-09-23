"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { deleteDocumentAction } from "@/actions/document";
// 注意：不能从 @/actions/_contract 导入 ROUTES——那是 "use server" 模块，
// 客户端组件引用会报错。此处只有一个跳转目标，写字面量并说明来源。
const DOCUMENTS_PATH = "/documents"; // = ROUTES.documents
import { FormError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * 文档删除入口（列表行内）。
 *
 * 与 Issue 的删除交互保持一致：用原生 `<details>/<summary>` 承载二次确认，换来三点——
 * 无 JS 时仍可展开并提交、键盘可达且展开状态由浏览器维护（组件无需本地 state）、
 * 表单始终存在于 SSR 输出中便于自动化测试。
 *
 * 删除后的状态更新与跳转：Action 内 `revalidatePath("/documents")` 让列表数据失效，
 * 被删文档因 `deletedAt: null` 过滤而自然消失；但**跳转要组件自己做**（见下方 useEffect）。
 * 失败（NOT_FOUND 等）通过 FormError 就地呈现，不会静默。
 */
export function DeleteDocumentForm({ documentId, title }: { documentId: string; title: string }) {
  const [state, formAction] = useActionState(deleteDocumentAction, null);
  const router = useRouter();

  // 删除后文档带 deletedAt，详情页的查询会因 `deletedAt: null` 过滤而取不到它。
  // revalidatePath 只标脏数据，不会把用户挪走、也不会自动重取当前路由——实测删完
  // 仍停在原页面（条目还在，按钮僵在「删除中…」）。所以成功后：先 refresh 让列表
  // 拿到服务端最新数据；若当前正停在已失效的详情页，再跳回列表。
  useEffect(() => {
    if (!state?.ok) return;
    router.refresh();
    const path = window.location.pathname;
    if (path.startsWith(`${DOCUMENTS_PATH}/`)) router.push(DOCUMENTS_PATH);
  }, [router, state]);

  return (
    <details className="shrink-0">
      <summary
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-danger hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
