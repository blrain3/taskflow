import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  // Setup project：先生成会话 state，再跑依赖它的用例。
  //
  // 此处曾经缺配，是 CI 长期失败的根因——`auth.setup.ts` 一直存在于
  // `tests/e2e/` 下，但没有任何 project 声明 `testMatch`，Playwright 就
  // 从不执行它；于是 `tests/e2e/.auth/{owner,intruder}.json` 从不生成，
  // 而 `documents.spec.ts` / `cross-workspace.spec.ts` 顶层写了
  // `test.use({ storageState: OWNER_STATE })`，加载阶段即报
  // `Error reading storage state from tests/e2e/.auth/owner.json`。
  // 注意 `.auth/` 被 .gitignore 排除，属运行时产物，不能靠提交文件绕过。
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
