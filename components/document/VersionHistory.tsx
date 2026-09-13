import { restoreDocumentVersionFormAction } from "@/actions/document";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import type { DocumentVersionItem } from "@/types/document";

export function VersionHistory({ documentId, baseVersion, versions }: { documentId: string; baseVersion: number; versions: DocumentVersionItem[] }) {
  return (
    <aside className="rounded-lg border border-line p-4" aria-labelledby="version-history-heading">
      <h2 id="version-history-heading" className="text-sm font-medium text-fg">版本历史</h2>
      <div className="mt-3 space-y-2">
        {versions.map((version) => (
          <div key={version.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate text-fg">版本 {version.version} · {version.title}</p>
              <time className="text-xs text-fg-muted" dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
            </div>
            {version.version < baseVersion ? (
              <form action={restoreDocumentVersionFormAction}>
                <input type="hidden" name="documentId" value={documentId} />
                <input type="hidden" name="version" value={version.version} />
                <input type="hidden" name="baseVersion" value={baseVersion} />
                <Button type="submit" variant="ghost" className="shrink-0 text-xs">恢复</Button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

