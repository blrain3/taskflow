import { expect, test } from "@playwright/test";

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect([200, 503]).toContain(response.status());
  await expect(response.json()).resolves.toHaveProperty("status");
});

test("unauthenticated users are redirected from issues", async ({ page }) => {
  await page.goto("/issues");
  await expect(page).toHaveURL(/\/login/);
});
