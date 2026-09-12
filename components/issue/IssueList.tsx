import { IssueRow } from "@/components/issue/IssueRow";
import type { IssueItem } from "@/types/issue";

/**
 * 任务列表（US-005）。
 * 空状态给出创建入口的指引，而不是留一片空白。
 */
export function IssueList({ issues }: { issues: IssueItem[] }) {
  if (issues.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-sm font-medium text-fg">还没有任务</p>
        <p className="mt-1 text-sm text-fg-muted">用上面的表单创建第一个任务吧。</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className="text-xs text-fg-muted">共 {issues.length} 个任务</p>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueRow issue={issue} />
          </li>
        ))}
      </ul>
    </div>
  );
}
