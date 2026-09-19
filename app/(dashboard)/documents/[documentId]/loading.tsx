import { Skeleton } from "@/components/ui/skeleton";

/**
 * 详情页加载态：与 [documentId]/page.tsx 的两栏结构（编辑器 + 版本历史）保持一致，
 * 避免正文就绪后整页重排。宽度同样为 max-w-6xl。
 */
export default function DocumentDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
      <Skeleton className="h-5 w-20 rounded" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-lg border border-line p-5">
          <Skeleton className="h-8 w-3/5 rounded" />
          <Skeleton className="mt-4 h-[32rem] w-full rounded-lg" />
          <Skeleton className="mt-4 h-5 w-40 rounded" />
        </section>

        <aside className="rounded-lg border border-line p-4">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="mt-3 h-12 w-full rounded-md" />
          <Skeleton className="mt-2 h-12 w-full rounded-md" />
          <Skeleton className="mt-2 h-12 w-full rounded-md" />
        </aside>
      </div>

      <span className="sr-only">正在加载文档…</span>
    </div>
  );
}
