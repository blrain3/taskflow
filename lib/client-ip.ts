import "server-only";

import { headers } from "next/headers";

import { env } from "@/lib/env";

/**
 * 取客户端 IP，用于「按来源」限流。
 *
 * 返回 null 表示 **IP 维度不可信，调用方必须跳过按 IP 的限流**：
 * - 生产环境且未开启 TRUST_PROXY：转发头可被直连客户端任意伪造，按它分桶毫无保护价值；
 *   更糟的是所有请求都会落进同一个桶，攻击者打满这一个桶就能把全站登录/注册锁死。
 *   因此此时不做 IP 限流，主防线退守「按邮箱（+IP）的失败计数」。
 * - 其余情况返回头里的第一个地址；可信代理但没带转发头时归入 "unknown" 桶。
 *
 * 安全前提：`x-forwarded-for` / `x-real-ip` 只有在反向代理**覆写**（而不是追加）它们时才可信。
 * 生产 Nginx 必须写：
 *
 *   proxy_set_header X-Forwarded-For $remote_addr;
 *
 * 本地直连（docker 端口映射、无代理）取不到这两个头，在非生产环境统一归入 "unknown" 桶。
 */

const IP_HEADERS = ["x-forwarded-for", "x-real-ip"] as const;

/** 从请求头原文取第一个地址（`x-forwarded-for` 可能是逗号分隔的链路） */
export function parseClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * 解析限流用的客户端 IP 维度。
 * 返回 null = IP 维度不可信，调用方必须跳过按 IP 的限流（而不是把所有人挤进同一个桶）。
 */
export async function clientIpKey(): Promise<string | null> {
  // 生产环境只有明确开启可信代理时才读取转发头；否则宁可放弃这一维度，
  // 也不能让所有客户端共享一个可被单点打满的全局桶（等于送攻击者一个全站锁死开关）。
  if (env.isProduction && !env.TRUST_PROXY) return null;

  const store = await headers();

  for (const name of IP_HEADERS) {
    const ip = parseClientIp(store.get(name));
    if (ip) return ip;
  }

  return "unknown";
}
