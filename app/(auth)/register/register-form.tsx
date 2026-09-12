"use client";

import { useActionState } from "react";

import { registerAccount, type AuthFormState } from "@/actions/auth";
import { FieldError, FormError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export function RegisterForm() {
  const [state, formAction] = useActionState<AuthFormState, FormData>(registerAccount, null);

  const error = state && !state.ok ? state.error : null;
  const fields = error?.fields;
  const formMessage = error && !fields ? error.message : undefined;

  return (
    <form id="register-form" action={formAction} className="space-y-4" noValidate>
      <div>
        <Label className="block" htmlFor="name">
          昵称
        </Label>
        <Input id="name" name="name" autoComplete="name" placeholder="怎么称呼你" required />
        <FieldError message={fields?.name} />
      </div>

      <div>
        <Label className="block" htmlFor="email">
          邮箱
        </Label>
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
        <Label className="block" htmlFor="password">
          密码
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-hint"
          aria-invalid={fields?.password ? true : undefined}
        />
        <p className="mt-1 text-xs text-fg-muted" id="password-hint">
          至少 8 位，包含字母与数字
        </p>
        <FieldError message={fields?.password} />
      </div>

      <FormError message={formMessage} />

      <SubmitButton className="w-full" pendingText="创建中…">
        创建账号
      </SubmitButton>
    </form>
  );
}
