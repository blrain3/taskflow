import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentEditor } from "@/components/document/DocumentEditor";
import { VersionHistory } from "@/components/document/VersionHistory";
import { getDocument, listDocumentVersions } from "@/lib/documents";
import { requireWorkspaceContext } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "编辑文档" };

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const [{ documentId }, { workspace }] = await Promise.all([params, requireWorkspaceContext()]);
  const document = await getDocument(documentId, workspace.id);
  if (!document) notFound();
  const versions = await listDocumentVersions(document.id, workspace.id);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/documents" className="text-sm text-fg-muted hover:text-fg">← 返回文档列表</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-lg border border-line p-5" aria-labelledby="editor-heading">
          <h1 id="editor-heading" className="sr-only">编辑文档</h1>
          <DocumentEditor document={document} />
        </section>
        <VersionHistory documentId={document.id} baseVersion={document.contentVersion} versions={versions} />
      </div>
    </div>
  );
}
