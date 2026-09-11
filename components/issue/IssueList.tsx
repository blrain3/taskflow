import { IssueRow } from "@/components/issue/IssueRow";
import type { IssueItem } from "@/types/issue";

/**
 * 任务列表（US-005）。
 * 空状态给出创建入口的指引，而不是留一片空白。
 */
export function IssueList({ issues }: { issues: IssueItem[] }) {
  if (issues.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center">
        <p className="text-sm font-medium text-zinc-800">还没有任务</p>
        <p className="mt-1 text-sm text-zinc-500">用上面的表单创建第一个任务吧。</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="text-xs text-zinc-500">共 {issues.length} 个任务</p>
      <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueRow issue={issue} />
          </li>
        ))}
      </ul>
    </div>
  );
}
