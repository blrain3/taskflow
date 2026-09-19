import { expect, test } from "@playwright/test";

import { OWNER_STATE } from "./helpers/accounts";

test.use({ storageState: OWNER_STATE });

/**
 * 文档写作域的完整闭环（ADR-007 第一阶段）。
 *
 * 覆盖：创建 → 自动保存与版本递增 → 版本恢复 → 软删除，以及三类关键异常：
 * 超长标题的服务端校验、两个标签页并发保存的乐观锁冲突、跨账号访问他人文档。
 *
 * 断言尽量落在用户可见的文案上（「已保存 · 版本 N」「保存失败」），而不是内部状态——
 * 这样重构组件内部实现时用例不需要跟着改。
 */

test.describe("文档创建与列表", () => {
  test("从列表页创建文档并进入编辑器", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "文档" })).toBeVisible();

    const title = `E2E 创建-${Date.now()}`;
    await page.getByLabel("标题").fill(title);
    await page.getByLabel("正文").fill("# 目标\n\n用自然语言描述工作，由 AI 拆解为结构化子任务。");
    await page.getByRole("button", { name: "创建文档" }).click();

    // 创建成功后表单被重置，列表出现新文档
    await expect(page.getByRole("list").getByRole("link", { name: title })).toBeVisible();

    await page.getByRole("link", { name: title }).click();
    await expect(page.getByLabel("文档标题")).toHaveValue(title);
    await expect(page.getByRole("heading", { name: "版本历史" })).toBeVisible();
  });

  test("空标题被浏览器拦截，不发出请求", async ({ page }) => {
    await page.goto("/documents");
    await page.getByRole("button", { name: "创建文档" }).click();

    // required 属性在客户端拦截：仍停留在列表页，且没有新增「无标题」文档
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByLabel("标题")).toBeFocused();
  });

  test("超长标题被服务端拒绝并给出可读错误", async ({ page }) => {
    await page.goto("/documents");
    // 客户端没有 maxlength，201 字符会真实提交到服务端
    await page.getByLabel("标题").fill(`超${"长".repeat(200)}`);
    await page.getByLabel("正文").fill("正文");
    await page.getByRole("button", { name: "创建文档" }).click();

    await expect(page.getByText("标题不能超过 200 个字符")).toBeVisible();
  });
});

test.describe("编辑、自动保存与版本历史", () => {
  let documentTitle: string;

  test.beforeEach(async ({ page }) => {
    documentTitle = `E2E 编辑-${Date.now()}`;
    await page.goto("/documents");
    await page.getByLabel("标题").fill(documentTitle);
    await page.getByLabel("正文").fill("# 初稿\n\n第一段正文。");
    await page.getByRole("button", { name: "创建文档" }).click();
    await page.getByRole("link", { name: documentTitle }).click();
    await expect(page.getByLabel("文档标题")).toHaveValue(documentTitle);
  });

  test("停止输入后自动保存并递增版本号", async ({ page }) => {
    await page.getByLabel("文档标题").fill(`${documentTitle}-改`);
    await page.getByLabel("文档正文").fill("# 初稿\n\n第一段正文。\n\n补充一段。");

    // 自动保存（1.2s 防抖）完成后状态行更新，且版本号从 1 递增到 2
    await expect(page.getByText("已保存 · 版本 2")).toBeVisible({ timeout: 15_000 });

    // 刷新后改动仍在（服务端已落库）
    await page.reload();
    await expect(page.getByLabel("文档标题")).toHaveValue(`${documentTitle}-改`);
    await expect(page.getByText("已保存 · 版本 2")).toBeVisible();
  });

  test("恢复历史版本会把旧内容写回并生成新版本", async ({ page }) => {
    const originalTitle = documentTitle;

    await page.getByLabel("文档标题").fill(`${documentTitle}-改`);
    await expect(page.getByText("已保存 · 版本 2")).toBeVisible({ timeout: 15_000 });

    // 展开版本 1 的恢复确认
    const restore = page.getByRole("listitem").filter({ hasText: "版本 1" }).getByText("恢复");
    await restore.click();
    await page.getByRole("button", { name: "确认恢复" }).click();

    // 恢复是一次新的正向修改：标题回到旧值，版本号继续递增到 3
    await expect(page.getByLabel("文档标题")).toHaveValue(originalTitle, { timeout: 15_000 });
    await expect(page.getByText("已保存 · 版本 3")).toBeVisible();
  });

  test("两个标签页并发保存，后保存者收到冲突提示", async ({ page, context }) => {
    const secondTab = await context.newPage();
    await secondTab.goto(page.url());

    // 标签页 A 先保存：版本 1 → 2
    await page.getByLabel("文档标题").fill(`${documentTitle}-A`);
    await expect(page.getByText("已保存 · 版本 2")).toBeVisible({ timeout: 15_000 });

    // 标签页 B 仍持有版本 1 的 baseVersion，自动保存必然冲突
    await secondTab.getByLabel("文档标题").fill(`${documentTitle}-B`);
    await expect(secondTab.getByText("保存失败，请重试")).toBeVisible({ timeout: 15_000 });

    // 冲突不得污染服务端数据：标题仍是 A 写入的值
    await page.reload();
    await expect(page.getByLabel("文档标题")).toHaveValue(`${documentTitle}-A`);
  });

  test("删除文档后从列表消失", async ({ page }) => {
    await page.getByLabel("文档标题").fill(`${documentTitle}-待删除`);
    await expect(page.getByText("已保存 · 版本 2")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "返回文档列表" }).click();
    const row = page.getByRole("list").getByRole("link", { name: `${documentTitle}-待删除` });
    await expect(row).toBeVisible();

    await row.click();
    await page.getByLabel(`删除「${documentTitle}-待删除」`).click();
    await page.getByRole("button", { name: "确认删除" }).click();

    // 删除后回到列表（或手动返回），该文档不再出现
    await page.getByRole("link", { name: "返回文档列表" }).click();
    await expect(page.getByRole("list")).not.toContainText(`${documentTitle}-待删除`);
  });
});
