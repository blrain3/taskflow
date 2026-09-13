import { RestoreVersionForm } from "@/components/document/RestoreVersionForm";
import { formatDateTime } from "@/lib/utils";
import type { DocumentVersionItem } from "@/types/document";

/**
 * 版本历史（服务端组件）。
 *
 * 列表整体在服务端渲染，只有「恢复」这一处交互下沉到客户端组件，
 * 历史条目本身因此不进入客户端 bundle。
 * 只对早于当前版本的条目显示恢复入口——当前版本就是正文本身，恢复它没有意义。
 */
export function VersionHistory({
  documentId,
  baseVersion,
  versions,
}: {
  documentId: string;
  baseVersion: number;
  versions: DocumentVersionItem[];
}) {
  return (
    <aside className="rounded-lg border border-line p-4" aria-labelledby="version-history-heading">
      <h2 id="version-history-heading" className="text-sm font-medium text-fg">
        版本历史
      </h2>

      {versions.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">暂无历史版本</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {versions.map((version) => (
            <li key={version.id} className="rounded-md border border-line px-3 py-2">
              <p className="truncate text-sm text-fg">
                版本 {version.version} · {version.title}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <time className="text-xs text-fg-muted" dateTime={version.createdAt}>
                  {formatDateTime(version.createdAt)}
                </time>
                {version.version < baseVersion ? (
                  <RestoreVersionForm
                    documentId={documentId}
                    version={version.version}
                    baseVersion={baseVersion}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
