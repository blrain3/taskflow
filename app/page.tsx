import Link from "next/link";

/**
 * 公开落地页（静态预渲染，不读取会话）。
 * 登录后的工作区界面在 (dashboard) 路由组下。
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
          登录后进入你的工作区，管理任务列表与看板；也可以直接描述一段工作，由 AI
          拆成结构化子任务，确认后批量创建。
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            href="/login"
          >
            登录
          </Link>
          <Link
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
            href="/register"
          >
            创建账号
          </Link>
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          <Link className="underline underline-offset-4" href="/api/health">
            查看系统状态
          </Link>
        </p>
      </main>
    </div>
  );
}
