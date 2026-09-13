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
  /**
   * Server Action 请求体上限。
   *
   * 默认 1MB 与文档正文上限（lib/validation.ts 的 DOCUMENT_CONTENT_MAX_LENGTH = 20 万字符）不匹配：
   * 20 万个 4 字节字符约 800KB，若走 application/x-www-form-urlencoded（无 JS 时的原生表单提交，
   * 中文会被百分号编码成 9 字节/字）可达约 1.8MB——会在到达 Action 之前就被框架拒绝，
   * 于是「正文不能超过 200000 个字符」这条友好提示永远不会触发，用户拿到的是框架层的不透明错误。
   * 取 3MB 覆盖最坏情况并留出余量。
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
