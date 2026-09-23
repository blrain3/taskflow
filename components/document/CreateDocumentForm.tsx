"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createDocumentAction } from "@/actions/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FieldError } from "@/components/ui/field-error";

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

  // 校验失败时 action 返回 message + fields：message 是笼统的「请检查文档内容」，
  // 具体错因在 fields.title / fields.content 里。以前只渲染 message，导致用户
  // 提交超长标题后看不到任何可读错因（既不可用也不满足 WCAG 3.3.1）。
  const fields = state && !state.ok ? state.error.fields : undefined;
  const titleError = fields?.title;
  const contentError = fields?.content;
  const formLevelError =
    state && !state.ok && fields && Object.keys(fields).length > 0
      ? undefined
      : state && !state.ok
        ? state.error.message
        : undefined;

  return (
    <form
      id="create-document-form"
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border border-line p-4"
    >
      <h2 className="text-sm font-medium text-fg">新建文档</h2>

      <div>
        <Label htmlFor="document-title">标题</Label>
        <Input
          id="document-title"
          name="title"
          required
          placeholder="文档标题"
          className="mt-1"
          aria-describedby={titleError ? "document-title-error" : undefined}
          aria-invalid={titleError ? true : undefined}
        />
        <FieldError id="document-title-error" message={titleError} />
      </div>

      <div>
        <Label htmlFor="document-content">正文</Label>
        <Textarea
          id="document-content"
          name="content"
          rows={5}
          placeholder="使用 Markdown 开始写作"
          className="mt-1 font-mono text-sm"
          aria-describedby={contentError ? "document-content-error" : undefined}
          aria-invalid={contentError ? true : undefined}
        />
        <FieldError id="document-content-error" message={contentError} />
      </div>

      {/* 字段级错误已各自挂在对应输入框下，这里只兜底展示与具体字段无关的错误 */}
      <FormError message={formLevelError} />
      <Button type="submit" disabled={pending}>
        {pending ? "创建中…" : "创建文档"}
      </Button>
    </form>
  );
}
