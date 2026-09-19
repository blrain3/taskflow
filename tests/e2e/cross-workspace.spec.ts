import { expect, test } from "@playwright/test";

import { INTRUDER_STATE, OWNER_STATE } from "./helpers/accounts";

/**
 * 跨 Workspace 隔离的浏览器级验证。
 *
 * 服务端已有 Jest 覆盖「跨 Workspace 编辑被拒绝」；这里补的是浏览器视角的可见行为：
 * 另一个账号打开他人文档 URL 必须看到 404 页面——**不能**重定向回列表（那会泄露「文档存在
 * 但你无权访问」），也**不能**渲染出标题等任何内容。
 */
test.use({ storageState: OWNER_STATE });

test("其他账号无法打开他人文档，且不泄露存在性", async ({ page, browser }) => {
  const title = `E2E 越权-${Date.now()}`;

  // 作者创建一篇文档
  await page.goto("/documents");
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("正文").fill("这篇文档只有作者能看。");
  await page.getByRole("button", { name: "创建文档" }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByLabel("文档标题")).toHaveValue(title);
  const documentUrl = page.url();

  // 另一个账号在独立上下文里打开同一 URL
  const intruderContext = await browser.newContext({ storageState: INTRUDER_STATE });
  const intruderPage = await intruderContext.newPage();
  await intruderPage.goto(documentUrl);

  // 404 文案可见，且没有渲染出文档标题
  await expect(intruderPage.getByText("页面不存在")).toBeVisible();
  await expect(intruderPage.getByText("404").first()).toBeVisible();
  await expect(intruderPage.getByRole("link", { name: title })).toHaveCount(0);

  await intruderContext.close();
});
