import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "注册" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">创建 TaskFlow 账号</h1>
      <p className="mt-2 text-sm text-fg-muted">注册后会自动为你初始化一个工作区，无需额外配置。</p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        已有账号？
        <Link className="ml-1 underline underline-offset-4" href="/login">
          登录
        </Link>
      </p>
    </>
  );
}
