import { handlers } from "@/lib/auth";

/**
 * Auth.js 的 HTTP 入口（/api/auth/*）。
 * Route Handler 而非 Server Action：登录流程需要 Auth.js 自己控制重定向与 Set-Cookie。
 */
export const { GET, POST } = handlers;
