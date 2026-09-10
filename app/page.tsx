import Link from "next/link";

/**
 * 根路径：Sprint 0 的落地页 / 健康检查入口。
 * Sprint 1 起会被真正的任务界面取代（(auth) 登录页 + (dashboard) 工作区）。
 */
export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-2xl">
        <p className="text-sm font-medium text-zinc-500">TaskFlow</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          用自然语言拆解任务，落到看板上
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-600">
          工程基线已就绪：Next.js App Router、Prisma + PostgreSQL、Docker Compose
          一键启动。业务功能按 Sprint 计划推进。
        </p>

        <dl className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 p-4">
            <dt className="text-sm font-medium">当前阶段</dt>
            <dd className="mt-1 text-sm text-zinc-600">Sprint 0 · 工程基线</dd>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <dt className="text-sm font-medium">健康检查</dt>
            <dd className="mt-1 text-sm text-zinc-600">
              <Link className="underline underline-offset-4" href="/api/health">
                GET /api/health
              </Link>
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            href="/api/health"
          >
            查看系统状态
          </Link>
        </div>
      </main>
    </div>
  );
}
