"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { clientIpKey } from "@/lib/client-ip";
import { isUniqueViolation } from "@/lib/db-errors";
import { env } from "@/lib/env";
import { toActionError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import {
  checkRateLimit,
  consumeRateLimit,
  recordRateLimitHit,
  resetRateLimit,
} from "@/lib/rate-limit";
import { fieldErrorsOf, loginSchema, registerSchema } from "@/lib/validation";
import type { ActionError, ActionResult } from "@/types/action";

/**
 * 认证入口（docs/architecture.md §8.1 链路一）。
 *
 * 关于返回契约的例外：登录/注册成功后必须用服务端 redirect() 跳转——
 * 这样 Dashboard 才会带着新会话重新做 RSC 渲染。因此成功路径不返回 ActionResult，
 * 只有失败路径返回统一错误结构。
 */

const DASHBOARD_PATH = "/issues";
const CREDENTIALS_ERROR_MESSAGE = "邮箱或密码不正确";

/** 认证类限流的统一窗口：1 分钟 */
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

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
  const ip = await clientIpKey();
  const windowMs = AUTH_RATE_LIMIT_WINDOW_MS;

  // 邮箱桶按「邮箱 + 来源 IP」组合分桶，而不是只按邮箱：
  // 若只按邮箱，攻击者用自己的一个 IP 打满 10 次失败，就能把真实用户挡在门外
  // （拦截发生在验证之前，正确密码也过不去），等于给人一个免费的锁号手段。
  // 组合桶下攻击者只能烧掉自己那份额度，真实用户从自己的 IP 登录完全不受影响。
  const emailKey = `auth:login:email:${email}:${ip}`;
  const ipKey = `auth:login:ip:${ip}`;

  // 第一步：限流闸门。
  // - IP 桶每次尝试都计数：保护 bcrypt 与后续成本，限制未认证的批量尝试；
  // - 邮箱桶只检查、不计数：失败时才在 catch 里补记，成功即清零。
  try {
    consumeRateLimit({
      key: ipKey,
      limit: env.AUTH_IP_RATE_LIMIT_PER_MINUTE,
      windowMs,
      label: "auth:login:ip",
    });
    checkRateLimit({
      key: emailKey,
      limit: env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
      windowMs,
      label: "auth:login:email",
    });
  } catch (error) {
    return failure(toActionError(error));
  }

  // 第二步：真正认证
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (isRedirectSignal(error)) throw error;

    recordRateLimitHit(emailKey, windowMs);

    if (error instanceof AuthError) {
      return failure({ code: "UNAUTHORIZED", message: CREDENTIALS_ERROR_MESSAGE });
    }
    return failure(toActionError(error));
  }

  // 登录成功：清掉该「邮箱 + IP」的失败计数
  resetRateLimit(emailKey);
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
  try {
    consumeRateLimit({
      key: `auth:register:ip:${await clientIpKey()}`,
      limit: env.AUTH_REGISTER_RATE_LIMIT_PER_MINUTE,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      label: "auth:register:ip",
    });
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
