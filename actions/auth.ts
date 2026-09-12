"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { assertLoginAllowed, consumeRegisterAttempt } from "@/lib/auth-rate-limit";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError, toActionError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { fieldErrorsOf, loginSchema, registerSchema } from "@/lib/validation";
import type { ActionError, ActionResult } from "@/types/action";

/**
 * 认证入口（docs/02-architecture/architecture.md §8.1 链路一）。
 *
 * 关于返回契约的例外：登录/注册成功后必须用服务端 redirect() 跳转——
 * 这样 Dashboard 才会带着新会话重新做 RSC 渲染。因此成功路径不返回 ActionResult，
 * 只有失败路径返回统一错误结构。
 *
 * 登录限流的计数在 authorize()（lib/auth-rate-limit.ts）里统一执行——凭据回调
 * /api/auth/callback/credentials 可以绕开本文件，Action 里只保留只读前置检查
 * 提供带剩余秒数的友好提示，不再重复计数。
 */

const DASHBOARD_PATH = "/issues";
const CREDENTIALS_ERROR_MESSAGE = "邮箱或密码不正确";

export type AuthFormState = ActionResult<null> | null;

function failure(error: ActionError): AuthFormState {
  return { ok: false, error };
}

/** next/navigation 的 redirect 通过抛出带 digest 的特殊错误实现，必须原样放行 */
function isRedirectSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** 用凭据登录并跳转；失败时返回可展示的错误 */
async function signInWithCredentials(email: string, password: string): Promise<AuthFormState> {
  // 第一步：只读前置检查，超限直接给出带剩余秒数的提示（计数在 authorize 里）
  try {
    await assertLoginAllowed(email);
  } catch (error) {
    return failure(toActionError(error));
  }

  // 第二步：真正认证。失败计数由 authorize 负责（同时覆盖 REST 回调路径）
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (isRedirectSignal(error)) throw error;

    if (error instanceof AppError) {
      return failure(toActionError(error));
    }
    if (error instanceof AuthError) {
      return failure({ code: "UNAUTHORIZED", message: CREDENTIALS_ERROR_MESSAGE });
    }
    return failure(toActionError(error));
  }

  redirect(DASHBOARD_PATH);
}

export async function registerAccount(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查填写内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  const { name, email, password } = parsed.data;

  // 注册限流：只能按来源 IP 分桶（邮箱由攻击者任意构造，分桶无意义）。
  // 这里每次尝试都计数、成功也不退还：bcrypt 的 CPU 成本落在「成功注册」路径上，
  // 如果只对失败计数，攻击者用随机邮箱批量注册成功反而会不断重置额度。
  // IP 维度不可信时跳过（见 lib/client-ip.ts）——不能用全局桶把所有人锁死。
  try {
    await consumeRegisterAttempt();
  } catch (error) {
    return failure(toActionError(error));
  }

  try {
    const db = getPrisma();
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return failure({
        code: "CONFLICT",
        message: "该邮箱已注册",
        fields: { email: "该邮箱已注册，请直接登录" },
      });
    }

    await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return failure({
        code: "CONFLICT",
        message: "该邮箱已注册",
        fields: { email: "该邮箱已注册，请直接登录" },
      });
    }
    return failure(toActionError(error));
  }

  return signInWithCredentials(email, password);
}

export async function loginWithCredentials(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure({
      code: "VALIDATION_FAILED",
      message: "请检查填写内容",
      fields: fieldErrorsOf(parsed.error),
    });
  }

  return signInWithCredentials(parsed.data.email, parsed.data.password);
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
