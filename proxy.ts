import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * 粗粒度路由保护（架构评审 P0-3）。
 *
 * 页面内的 requireUserOrRedirect / requireWorkspaceContext 仍然是权威校验（纵深防御），
 * 且职责更重（解析 Workspace）；proxy 只负责把「未登录访问受保护路径」挡在 RSC 渲染之前，
 * 把「必须登录」从「每新增一个页面都要记得加一行校验」变成框架层保证。
 *
 * 说明：这里只做 JWT Cookie 的解码校验，不查库；被伪造 Cookie 命中的请求会在页面层
 * 被 requireUser 拒绝。matcher 只列受保护的业务区，公开页（登录/注册/落地页）、
 * API（含 /api/auth、/api/health）与静态资源不经过本文件。
 */
export default auth((request) => {
  if (!request.auth?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/issues/:path*", "/overview/:path*", "/settings/:path*"],
};
