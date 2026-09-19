import { expect, test } from "@playwright/test";

import { INTRUDER_STATE, OWNER_STATE, makeAccount, registerAndSaveState } from "./helpers/accounts";

/**
 * 会话准备（Playwright 官方 setup project 模式）。
 *
 * 每次运行创建两个账号：owner 用于文档闭环用例，intruder 用于「跨账号不可访问」的越权断言。
 * 注册/登录各只走一次 UI 真实路径，之后所有用例通过 storageState 复用会话——
 * 否则每条用例都注册一次，会撞上「同 IP 每分钟 5 次注册」的限流。
 *
 * 邮箱带随机后缀：重复运行时基本不会撞已注册邮箱，因此「注册 → 落库」这条链路每次都是真实路径。
 * 若确实撞上（极少），换一个随机账号重试一次即可。
 */

test("prepare owner session", async ({ page }) => {
  let account = makeAccount("owner");

  try {
    await registerAndSaveState(page, account, OWNER_STATE);
  } catch {
    account = makeAccount("owner");
    await registerAndSaveState(page, account, OWNER_STATE);
  }

  await expect(page).toHaveURL(/\/(issues|documents)/);
});

test("prepare intruder session", async ({ page }) => {
  let account = makeAccount("intruder");

  try {
    await registerAndSaveState(page, account, INTRUDER_STATE);
  } catch {
    account = makeAccount("intruder");
    await registerAndSaveState(page, account, INTRUDER_STATE);
  }

  await expect(page).toHaveURL(/\/(issues|documents)/);
});
