import { Skeleton } from "@/components/ui/skeleton";

/**
 * 加载态：容器宽度与 documents/page.tsx 一致（max-w-6xl），
 * 数据到达时不会整页位移；结构与列表页逐块对应（标题、新建表单、列表）。
 */
export default function DocumentsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true">
      <div>
        <Skeleton className="h-6 w-16 rounded" />
        <Skeleton className="mt-2 h-5 w-48 rounded" />
      </div>

      <div className="rounded-lg border border-line p-4">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="mt-3 h-4 w-12 rounded" />
        <Skeleton className="mt-1 h-9 w-full rounded-lg" />
        <Skeleton className="mt-3 h-4 w-12 rounded" />
        <Skeleton className="mt-1 h-24 w-full rounded-lg" />
        <Skeleton className="mt-3 h-9 w-28 rounded-lg" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-5 w-24 rounded" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>

      <span className="sr-only">正在加载文档…</span>
    </div>
  );
}
