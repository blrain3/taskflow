import type { ReactNode } from "react";

/** 未登录区域：登录 / 注册共用居中卡片布局 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
