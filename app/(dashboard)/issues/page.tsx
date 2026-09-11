import type { Metadata } from "next";

import { IssueForm } from "@/components/issue/IssueForm";
import { IssueList } from "@/components/issue/IssueList";
import { listIssues } from "@/lib/issues";
import { requireWorkspaceContext } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "任务" };

/**
 * 任务列表页（US-003 / US-004 / US-005）。
 * 数据在服务端直读（architecture.md §7.1 通道 A），变更通过 Server Action 走通道 B。
 */
export default async function IssuesPage() {
  const { workspace } = await requireWorkspaceContext();
  const issues = await listIssues(workspace.id);

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">任务</h1>
        <p className="mt-1 text-sm text-zinc-600">当前工作区：{workspace.name}</p>
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

      <IssueList issues={issues} />
    </div>
  );
}
