import type { ReactNode } from "react";

import { logout } from "@/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireWorkspaceContext } from "@/lib/permissions";

/**
 * 受保护区外壳（docs/02-architecture/architecture.md §8.1 链路一）。
 *
 * 布局级校验只解决「首屏直接访问」的体验问题；Next.js 的布局在客户端导航时不会重新执行，
 * 因此每个受保护页面都必须自行再做一次会话校验（见 lib/auth.ts 的 requireUserOrRedirect）。
 */

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireWorkspaceContext();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">TaskFlow</span>
          <span className="text-sm text-fg-muted">{workspace.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">{user.name ?? user.email}</span>
          <form action={logout}>
            <SubmitButton variant="ghost" pendingText="登出中…">
              登出
            </SubmitButton>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
