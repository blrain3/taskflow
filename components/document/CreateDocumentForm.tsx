"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createDocumentAction } from "@/actions/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/ui/field-error";

/**
 * 新建文档表单。
 *
 * 刻意不提交 workspaceId：工作区由 Action 从会话推导（服务端不信任客户端传值），
 * 客户端多传一个字段只会制造「以为它起作用」的错觉。
 */
export function CreateDocumentForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createDocumentAction, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-line p-4">
      <h2 className="text-sm font-medium text-fg">新建文档</h2>

      <div>
        <Label htmlFor="document-title">标题</Label>
        <Input id="document-title" name="title" required placeholder="文档标题" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="document-content">正文</Label>
        <Textarea
          id="document-content"
          name="content"
          rows={5}
          placeholder="使用 Markdown 开始写作"
          className="mt-1 font-mono text-sm"
        />
      </div>

      <FormError message={state && !state.ok ? state.error.message : undefined} />
      <Button type="submit" disabled={pending}>
        {pending ? "创建中…" : "创建文档"}
      </Button>
    </form>
  );
}
