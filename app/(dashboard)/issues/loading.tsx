/**
 * 加载态（US-005：加载时不得引起布局跳动）。
 * 骨架的尺寸与真实页面一致，避免数据到达后整页位移。
 */
export default function IssuesLoading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true">
      <div className="h-6 w-20 animate-pulse rounded bg-zinc-200" />
      <div className="mt-2 h-5 w-56 animate-pulse rounded bg-zinc-100" />

      <div className="mt-6 rounded-lg border border-zinc-200 p-4">
        <div className="h-5 w-20 animate-pulse rounded bg-zinc-100" />
        <div className="mt-3 h-9 w-full animate-pulse rounded-lg bg-zinc-100" />
        <div className="mt-3 h-20 w-full animate-pulse rounded-lg bg-zinc-100" />
        <div className="mt-3 h-9 w-28 animate-pulse rounded-lg bg-zinc-100" />
      </div>

      <div className="mt-6 space-y-2">
        <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-100" />
      </div>

      <span className="sr-only">正在加载任务…</span>
    </div>
  );
}
