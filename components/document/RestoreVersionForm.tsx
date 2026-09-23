"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { restoreDocumentVersionAction } from "@/actions/document";
import { FormError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * 「恢复此版本」的二次确认表单。
 *
 * 两个刻意的选择：
 * 1. 用原生 `<details>/<summary>` 承载确认，而不是受控弹窗——无 JS 时仍可展开提交，
 *    且表单始终存在于 SSR 输出里（与 Issue 的删除交互同一取舍）。
 * 2. 用带状态的 Action，把返回值渲染出来：恢复失败（例如别处已保存导致版本过期 CONFLICT）
 *    必须让用户看见，否则表现为「点了没反应」。
 */
export function RestoreVersionForm({
  documentId,
  version,
  baseVersion,
}: {
  documentId: string;
  version: number;
  baseVersion: number;
}) {
  const [state, formAction] = useActionState(restoreDocumentVersionAction, null);
  const router = useRouter();

  // 恢复后服务端版本号已递增，本页面还有别处依赖它（编辑器状态行、编辑器表单的
  // baseVersion 隐藏字段）。router.refresh() 只会重新拉取被 revalidatePath 标脏的
  // segment，实测恢复后版本历史列表确实更新了，但编辑器拿到的 document prop 没变：
  // baseVersion 仍停在旧值，状态行也仍显示旧版本。后果不只是显示错——下一次自动
  // 保存会拿着过期的 baseVersion 提交，必然撞 CONFLICT。所以这里整页重载。
  useEffect(() => {
    if (state?.ok) window.location.reload();
  }, [state]);

  return (
    <details className="shrink-0">
      <summary className="cursor-pointer rounded-sm text-xs text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        恢复
        <span className="sr-only">版本 {version}</span>
      </summary>

      <div className="mt-2 w-full space-y-2">
        <p className="text-xs text-fg-muted">
          把版本 {version} 的内容恢复为当前内容？当前内容会保留为新版本，不会丢失。
        </p>

        <FormError message={state && !state.ok ? state.error.message : undefined} />

        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="baseVersion" value={baseVersion} />
          <SubmitButton variant="ghost" className="text-xs" pendingText="恢复中…">
            确认恢复
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
