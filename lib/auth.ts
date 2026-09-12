import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";

import { clearLoginFailures, consumeLoginAttempt, recordLoginFailure } from "@/lib/auth-rate-limit";
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
 *
 * 登录限流的计数必须在 authorize() 里做（lib/auth-rate-limit.ts）：凭据回调
 * /api/auth/callback/credentials 是一条绕开登录表单 Server Action 的公开入口，
 * 只在 Action 里限流等于给暴力破解留了一条不限速的路。
 */

export type AuthedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * 计时均衡用的固定 bcrypt 哈希（明文不是任何真实密码）。
 * 用户不存在时也对它跑一次 compare，让「邮箱不存在」与「密码错误」耗时一致，
 * 否则响应时间差可以枚举注册邮箱，与统一模糊文案的安全目标矛盾。
 */
const TIMING_EQUALIZER_HASH = "$2b$10$YuPPQRo.S3uuF4Nm7MAD5O0WR10VfeVRqp.wwOfcH/Y16/PT17MQe";

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
        const email = parsed.success ? parsed.data.email : null;

        // 真正的限流计数（IP 桶 + 邮箱失败桶）。表单 Action 只做只读前置检查，
        // 这里是唯一计数点，使表单与 REST 凭据回调两条路径受同一层保护。
        const gate = await consumeLoginAttempt(email);

        const { email: verifiedEmail, password } = parsed.success
          ? parsed.data
          : { email: null, password: undefined };

        // 邮箱不存在与密码错误走同一耗时路径、返回同样结果，避免账号枚举
        const user =
          verifiedEmail === null
            ? null
            : await getPrisma().user.findUnique({
                where: { email: verifiedEmail },
                select: { id: true, email: true, name: true, passwordHash: true },
              });

        const passwordMatches = await verifyPassword(
          password ?? "",
          user?.passwordHash ?? TIMING_EQUALIZER_HASH
        );
        if (!user || !passwordMatches) {
          recordLoginFailure(gate);
          return null;
        }

        clearLoginFailures(gate);
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
