/**
 * 加载态：容器宽度与 documents/page.tsx 一致（max-w-6xl），
 * 数据到达时不会整页位移；结构与列表页逐块对应（标题、新建表单、列表）。
 */
export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true">
      <div>
        <div className="h-6 w-16 animate-pulse rounded bg-hover" />
        <div className="mt-2 h-5 w-48 animate-pulse rounded bg-hover" />
      </div>

      <div className="rounded-lg border border-line p-4">
        <div className="h-5 w-20 animate-pulse rounded bg-hover" />
        <div className="mt-3 h-4 w-12 animate-pulse rounded bg-hover" />
        <div className="mt-1 h-9 w-full animate-pulse rounded-lg bg-hover" />
        <div className="mt-3 h-4 w-12 animate-pulse rounded bg-hover" />
        <div className="mt-1 h-24 w-full animate-pulse rounded-lg bg-hover" />
        <div className="mt-3 h-9 w-28 animate-pulse rounded-lg bg-hover" />
      </div>

      <div className="space-y-2">
        <div className="h-5 w-24 animate-pulse rounded bg-hover" />
        <div className="h-16 w-full animate-pulse rounded-lg bg-hover" />
        <div className="h-16 w-full animate-pulse rounded-lg bg-hover" />
      </div>

      <span className="sr-only">正在加载文档…</span>
    </div>
  );
}
