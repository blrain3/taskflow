import { Skeleton } from "@/components/ui/skeleton";

/**
 * 加载态（US-005：加载时不得引起布局跳动）。
 * 页面容器对列表与看板统一使用 max-w-6xl（见 issues/page.tsx），骨架因此与两种视图都
 * 保持同宽，数据到达后不会发生整页位移；loading.tsx 拿不到 searchParams，统一宽度
 * 是让骨架与真实页面必然对齐的唯一途径。
 */
export default function IssuesLoading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true">
      <Skeleton className="h-6 w-20 rounded" />
      <Skeleton className="mt-2 h-5 w-56 rounded" />

      <div className="mt-6 rounded-lg border border-line p-4">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="mt-3 h-9 w-full rounded-lg" />
        <Skeleton className="mt-3 h-20 w-full rounded-lg" />
        <Skeleton className="mt-3 h-9 w-28 rounded-lg" />
      </div>

      <div className="mt-6 space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>

      <span className="sr-only">正在加载任务…</span>
    </div>
  );
}
