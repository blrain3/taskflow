import type { DefaultSession } from "next-auth";

/**
 * Auth.js 类型增强。
 * 默认的 Session.user 只有 name / email / image，业务层需要 id 才能做权限判定。
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

export {};
