import Link from "next/link";
import type { Metadata } from "next";

import { Board } from "@/components/board/Board";
import { AiBreakdownPanel } from "@/components/issue/AiBreakdownPanel";
import { IssueForm } from "@/components/issue/IssueForm";
import { IssueList } from "@/components/issue/IssueList";
import { listIssues } from "@/lib/issues";
import { requireWorkspaceContext } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "任务" };

/**
 * 任务列表页（US-003 / US-004 / US-005 / US-006）。
 * 数据在服务端直读（architecture.md §7.1 通道 A），变更通过 Server Action 走通道 B。
 * 列表 / 看板用 URL Search Params 切换（可分享、可回退），P0-08 验收要求。
 */
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ workspace }, params] = await Promise.all([requireWorkspaceContext(), searchParams]);
  const isBoard = params.view === "board";
  const issues = await listIssues(workspace.id, isBoard ? "board" : "list");

  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"
    }`;

  return (
    // 列表与看板用不同容器宽度：列表 max-w-5xl（1024px）适合纵向阅读，
    // 看板需要容纳 4×296px + 3×20px 间距 ≈ 1244px，故放宽到 max-w-6xl（1152px）。
    // 列宽由 Board 内部按容器宽度决定，见 components/board/Board.tsx。
    <div className={isBoard ? "mx-auto max-w-6xl" : "mx-auto max-w-5xl"}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">任务</h1>
          <p className="mt-1 text-sm text-zinc-600">当前工作区：{workspace.name}</p>
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
        className="mt-6 rounded-lg border border-zinc-200 p-4"
        aria-labelledby="create-issue-heading"
      >
        <h2 className="text-sm font-medium text-zinc-800" id="create-issue-heading">
          新建任务
        </h2>
        <div className="mt-3">
          <IssueForm />
        </div>
      </section>

      {isBoard ? <Board issues={issues} /> : <IssueList issues={issues} />}

      <AiBreakdownPanel />
    </div>
  );
}
