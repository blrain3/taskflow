import Link from "next/link";
import type { Metadata } from "next";

import { CreateDocumentForm } from "@/components/document/CreateDocumentForm";
import { listDocuments } from "@/lib/documents";
import { requireWorkspaceContext } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { DOCUMENT_STATUS_LABELS } from "@/types/document";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "文档" };

/**
 * 文档列表页（ADR-007 第一阶段）。
 *
 * 容器宽度与 documents/loading.tsx 统一为 max-w-6xl：骨架拿不到数据，
 * 只有宽度与真实页面一致，数据到达时才不会整页位移（与 issues 同一取舍）。
 *
 * 数据经 lib/documents.ts 读取，不在页面内联 Prisma 查询——「列表投影不含正文」与
 * 「查询上限」属于领域规则，散落到路由层会各自漂移。
 */
export default async function DocumentsPage() {
  const { workspace } = await requireWorkspaceContext();
  const documents = await listDocuments(workspace.id);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">文档</h1>
        <p className="mt-1 text-sm text-fg-muted">当前工作区：{workspace.name}</p>
      </header>

      <CreateDocumentForm />

      <section aria-labelledby="document-list-heading">
        <h2 id="document-list-heading" className="mb-3 text-sm font-medium text-fg">
          最近文档
        </h2>

        {documents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-fg-muted">
            还没有文档
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {documents.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/documents/${item.id}`}
                  className="block p-4 transition-colors hover:bg-hover"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-fg">{item.title}</span>
                      {item.status === "DRAFT" ? null : (
                        <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted">
                          {DOCUMENT_STATUS_LABELS[item.status]}
                        </span>
                      )}
                    </span>
                    <time className="shrink-0 text-xs text-fg-muted" dateTime={item.updatedAt}>
                      {formatDateTime(item.updatedAt)}
                    </time>
                  </div>
                  {item.summary ? (
                    <p className="mt-1 truncate text-sm text-fg-muted">{item.summary}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
