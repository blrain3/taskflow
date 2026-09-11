import "server-only";

import { headers } from "next/headers";

import { env } from "@/lib/env";

/**
 * 取客户端 IP，用于「按来源」限流。
 *
 * 安全前提：`x-forwarded-for` / `x-real-ip` 都是**可伪造**的请求头，
 * 只有在反向代理**覆写**（而不是追加）它们时才可信。生产 Nginx 必须写：
 *
 *   proxy_set_header X-Forwarded-For $remote_addr;
 *
 * 否则攻击者每次带一个随机值即可绕过按 IP 的限流。
 * 因此按 IP 的限流只是第二道防线——登录的主防线是按邮箱的失败计数。
 *
 * 本地直连（docker 端口映射、无代理）取不到这两个头，统一归入 "unknown" 桶。
 */

const IP_HEADERS = ["x-forwarded-for", "x-real-ip"] as const;

/** 从请求头原文取第一个地址（`x-forwarded-for` 可能是逗号分隔的链路） */
export function parseClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first : null;
}

export async function clientIpKey(): Promise<string> {
  // 生产环境只有明确开启可信代理时才读取转发头，避免直连客户端伪造限流维度。
  if (env.isProduction && !env.TRUST_PROXY) return "unknown";
  const store = await headers();

  for (const name of IP_HEADERS) {
    const ip = parseClientIp(store.get(name));
    if (ip) return ip;
  }

  return "unknown";
}
