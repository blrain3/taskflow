import type { NextConfig } from "next";

/**
 * 安全响应头（架构评审 P1-7）：处理凭据的应用不应缺少基础缓解层。
 * - CSP 先以 Report-Only 起步：Next 的内联脚本需要 nonce/哈希才能收紧为强制模式，
 *   先上报观察、确认无误伤后再切换，是官方推荐的两步走方式。
 * - HSTS 只在 HTTPS 生效，本地 HTTP 无副作用。
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
