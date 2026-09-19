import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { Board } from "@/components/board/Board";
import { AiBreakdownPanel } from "@/components/issue/AiBreakdownPanel";
import { IssueForm } from "@/components/issue/IssueForm";
import { IssueList } from "@/components/issue/IssueList";
import { Skeleton } from "@/components/ui/skeleton";
import { listIssues } from "@/lib/issues";
import { requireWorkspaceContext } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "任务" };

/**
 * 任务列表页（US-003 / US-004 / US-005 / US-006）。
 * 数据在服务端直读（architecture.md §8.1 通道 A），变更通过 Server Action 走通道 B。
 * 列表 / 看板用 URL Search Params 切换（可分享、可回退）。
 *
 * 流式渲染（架构评审 P2-9）：页面外壳（标题、视图切换、创建表单、AI 面板）不依赖任务数据，
 * 因此不等待查询就先把外壳送出去；列表区单独用 <Suspense> 包住，由 `IssueView` 自行取数。
 * 效果是第一屏更快可见、且创建表单在慢查询下依然可用。
 */

/** 列表区骨架：与 loading.tsx 的列表部分同形同宽，数据到达时不发生位移 */
function IssueViewSkeleton() {
  return (
    <div className="mt-6 space-y-2" aria-busy="true">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <span className="sr-only">正在加载任务…</span>
    </div>
  );
}

/**
 * 列表区：自己取数、自己渲染。
 * workspaceId 由页面从服务端会话推导后传入——它始终来自服务端，绝不出自客户端入参。
 */
async function IssueView({ workspaceId, isBoard }: { workspaceId: string; isBoard: boolean }) {
  const issues = await listIssues(workspaceId, isBoard ? "board" : "list");

  return isBoard ? <Board issues={issues} /> : <IssueList issues={issues} />;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ workspace }, params] = await Promise.all([requireWorkspaceContext(), searchParams]);
  const isBoard = params.view === "board";

  /**
   * 视图切换胶囊（toggle 语义，不是按钮）：保持圆角胶囊形与 Button 的 rounded-md 区分开。
   * 令牌取值（bg-brand / border-line-strong / hover）与 Button 的 primary / secondary
   * 一致，只差形状——若将来引入独立的 Segmented/Toggle 组件，此处应替换而非继续内联。
   */
  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-brand text-fg-inverse" : "border border-line-strong text-fg-muted hover:bg-hover"
    }`;

  return (
    // 两种视图统一 max-w-6xl（1152px）：看板需要容纳 4×296px + 3×20px 间距 ≈ 1244px 的
    // 可用宽度；列表对这个宽度也完全可用。统一宽度的另一目的是让骨架（loading.tsx 与下面的
    // IssueViewSkeleton）与两种视图都对齐——骨架拿不到 searchParams，无法按视图分档。
    // 列宽由 Board 内部按容器宽度决定，见 components/board/Board.tsx。
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">任务</h1>
          <p className="mt-1 text-sm text-fg-muted">当前工作区：{workspace.name}</p>
        </div>

        <nav aria-label="视图切换" className="flex gap-2">
          <Link className={pill(!isBoard)} href="/issues">
            列表
          </Link>
          <Link className={pill(isBoard)} href="/issues?view=board">
            看板
          </Link>
        </nav>
      </header>

      <section
        className="mt-6 rounded-lg border border-line p-4"
        aria-labelledby="create-issue-heading"
      >
        <h2 className="text-sm font-medium text-fg" id="create-issue-heading">
          新建任务
        </h2>
        <div className="mt-3">
          <IssueForm />
        </div>
      </section>

      {/* key 绑定视图：切换列表/看板时卸载重挂，避免把上一视图的骨架或状态错配到当前视图 */}
      <Suspense key={isBoard ? "board" : "list"} fallback={<IssueViewSkeleton />}>
        <IssueView workspaceId={workspace.id} isBoard={isBoard} />
      </Suspense>

      <AiBreakdownPanel />
    </div>
  );
}
