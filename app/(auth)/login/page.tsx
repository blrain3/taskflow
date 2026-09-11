import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">登录 TaskFlow</h1>
      <p className="mt-2 text-sm text-zinc-600">用邮箱和密码进入你的工作区。</p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-6 text-sm text-zinc-600">
        还没有账号？
        <Link className="ml-1 underline underline-offset-4" href="/register">
          注册
        </Link>
      </p>
    </>
  );
}
