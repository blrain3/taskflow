import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";

import { AppError } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

/**
 * Auth.js 配置（docs/02-architecture/adr-001-technical-decisions.md §4）。
 *
 * 两个刻意的取舍，都是为了让「构建」不依赖「运行时配置」：
 *
 * 1. 会话策略固定为 JWT。Credentials Provider 只支持 jwt，配成 database 会在运行时直接报错。
 *    会话承载于 AUTH_SECRET 签名的 HttpOnly Cookie；Prisma 的 Session 表在 MVP 不写入。
 * 2. 不接 PrismaAdapter。在「Credentials + JWT」组合下适配器不会被调用（它服务于 OAuth
 *    账号绑定与邮箱类 Provider），却会在模块加载期构造 Prisma Client、进而读取 DATABASE_URL，
 *    使没有 .env 的构建环境整站构建失败。用户数据由 actions/auth.ts 直接读写 Prisma；
 *    Account / Session 表保留在 Schema 中，待接入 OAuth 时再启用适配器。
 *
 * 同理，这里不显式传 `secret`：Auth.js 会自行读取 AUTH_SECRET，缺失时抛出 MissingSecret。
 */

export type AuthedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getPrisma().user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true },
        });

        // 用户不存在与密码错误返回同样的结果，避免账号枚举
        if (!user) return null;

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});

/** 读取当前登录用户；未登录返回 null。用于需要「软」判定的场景。 */
export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  return {
    id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

/** 读取当前登录用户；未登录抛 UNAUTHORIZED。所有 Server Action 的第二步。 */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHORIZED");
  }
  return user;
}

/**
 * 页面/布局专用：未登录直接跳转登录页，而不是抛错。
 * 注意 Next.js 的布局在客户端导航时不会重新执行，因此每个受保护页面也必须自行调用本函数，
 * 不能只依赖 (dashboard)/layout.tsx 一次校验（见 next/dist/docs 的「Layouts and auth checks」）。
 */
export async function requireUserOrRedirect(redirectTo = "/login"): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}
