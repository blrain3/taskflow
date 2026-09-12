import "server-only";

import { env } from "@/lib/env";
import {
  checkRateLimit,
  consumeRateLimit,
  recordRateLimitHit,
  resetRateLimit,
} from "@/lib/rate-limit";
import { clientIpKey } from "@/lib/client-ip";

/**
 * 认证限流的共享实现（登录 / 注册）。
 *
 * 关键约束：**计数必须发生在 authorize() 里**，而不是只在登录表单的 Server Action 里。
 * Auth.js 的凭据回调 /api/auth/callback/credentials 是一条独立的公开入口——
 * 只在 Action 里限流的话，攻击者可以直接打 REST 端点绕开全部防线。
 * Action 侧保留一个「只查不计数」的前置检查，只为给出带剩余秒数的友好提示。
 *
 * IP 维度的语义（见 lib/client-ip.ts）：clientIpKey() 返回 null 表示 IP 不可信，
 * 此时跳过按 IP 的桶——宁可少一道防线，也不能让所有客户端共享一个可被单点打满的全局桶。
 * 邮箱失败桶始终保留（成功即清零，合法用户不受自己历史失败的影响）。
 */

/** 认证类限流的统一窗口：1 分钟 */
export const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;

/** 一次登录尝试的限流上下文；emailKey 供失败补记与成功清零复用 */
export type LoginGate = {
  /** null = IP 维度不可信，未参与限流 */
  ipKey: string | null;
  emailKey: string;
};

/**
 * 消耗一次登录尝试并检查邮箱失败桶。**这是真正计数的地方，只在 authorize() 里调用**，
 * 使 Server Action 表单与 REST 凭据回调两条路径都受到同一层保护。超限抛 RATE_LIMITED。
 * email 传 null（入参形状不合法）时只消耗 IP 桶，无法构建邮箱桶。
 */
export async function consumeLoginAttempt(email: string | null): Promise<LoginGate> {
  const ip = await clientIpKey();

  if (ip !== null) {
    consumeRateLimit({
      key: `auth:login:ip:${ip}`,
      limit: env.AUTH_IP_RATE_LIMIT_PER_MINUTE,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      label: "auth:login:ip",
    });
  }

  if (email === null) {
    return { ipKey: ip === null ? null : `auth:login:ip:${ip}`, emailKey: "" };
  }

  const gate: LoginGate = {
    ipKey: ip === null ? null : `auth:login:ip:${ip}`,
    emailKey: `auth:login:email:${email}:${ip ?? "local"}`,
  };
  checkRateLimit({
    key: gate.emailKey,
    limit: env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    label: "auth:login:email",
  });
  return gate;
}

/**
 * 登录 Action 的前置检查：只查不计数（计数统一发生在 authorize），
 * 让超限用户在进入凭据校验前就拿到带剩余秒数的提示。
 */
export async function assertLoginAllowed(email: string): Promise<void> {
  const ip = await clientIpKey();

  if (ip !== null) {
    checkRateLimit({
      key: `auth:login:ip:${ip}`,
      limit: env.AUTH_IP_RATE_LIMIT_PER_MINUTE,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      label: "auth:login:ip",
    });
  }
  checkRateLimit({
    key: `auth:login:email:${email}:${ip ?? "local"}`,
    limit: env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    label: "auth:login:email",
  });
}

/** 登录失败后补记邮箱桶（authorize 的失败路径调用） */
export function recordLoginFailure(gate: LoginGate): void {
  if (!gate.emailKey) return;
  recordRateLimitHit(gate.emailKey, AUTH_RATE_LIMIT_WINDOW_MS);
}

/** 登录成功后清零邮箱失败计数（authorize 的成功路径调用） */
export function clearLoginFailures(gate: LoginGate): void {
  if (!gate.emailKey) return;
  resetRateLimit(gate.emailKey);
}

/**
 * 注册尝试计数：每次都计数、成功不退还（bcrypt 成本落在成功路径上）。
 * 只能按来源 IP 分桶（邮箱由攻击者任意构造）；IP 不可信时跳过——
 * 宁可接受这一维度缺失，也不能用全局桶让任何人都注册不了。
 */
export async function consumeRegisterAttempt(): Promise<void> {
  const ip = await clientIpKey();
  if (ip === null) return;

  consumeRateLimit({
    key: `auth:register:ip:${ip}`,
    limit: env.AUTH_REGISTER_RATE_LIMIT_PER_MINUTE,
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    label: "auth:register:ip",
  });
}
