/**
 * 详情页加载态：与 [documentId]/page.tsx 的两栏结构（编辑器 + 版本历史）保持一致，
 * 避免正文就绪后整页重排。宽度同样为 max-w-6xl。
 */
export default function DocumentDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
      <div className="h-5 w-20 animate-pulse rounded bg-hover" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-lg border border-line p-5">
          <div className="h-8 w-3/5 animate-pulse rounded bg-hover" />
          <div className="mt-4 h-[32rem] w-full animate-pulse rounded-lg bg-hover" />
          <div className="mt-4 h-5 w-40 animate-pulse rounded bg-hover" />
        </section>

        <aside className="rounded-lg border border-line p-4">
          <div className="h-5 w-16 animate-pulse rounded bg-hover" />
          <div className="mt-3 h-12 w-full animate-pulse rounded-md bg-hover" />
          <div className="mt-2 h-12 w-full animate-pulse rounded-md bg-hover" />
          <div className="mt-2 h-12 w-full animate-pulse rounded-md bg-hover" />
        </aside>
      </div>

      <span className="sr-only">正在加载文档…</span>
    </div>
  );
}
