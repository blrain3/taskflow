"use client";

import { useActionState } from "react";

import { loginWithCredentials, type AuthFormState } from "@/actions/auth";
import { FieldError, FormError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(loginWithCredentials, null);

  const error = state && !state.ok ? state.error : null;
  const fields = error?.fields;
  // 有字段级错误时只显示字段提示，避免同一问题出现两遍
  const formMessage = error && !fields ? error.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="email">
          邮箱
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          aria-invalid={fields?.email ? true : undefined}
        />
        <FieldError message={fields?.email} />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-800" htmlFor="password">
          密码
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={fields?.password ? true : undefined}
        />
        <FieldError message={fields?.password} />
      </div>

      <FormError message={formMessage} />

      <SubmitButton className="w-full" pendingText="登录中…">
        登录
      </SubmitButton>
    </form>
  );
}
