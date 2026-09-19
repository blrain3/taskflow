import type { Page } from "@playwright/test";

/**
 * E2E 测试账号工厂。
 *
 * 邮箱带随机后缀有两个目的：注册限流按「IP + 邮箱」计数（每分钟 5 次），随机化可以避免
 * 上一轮测试残留的同名账号触发限流；同时保证重复运行时「注册 → 落库」这条链路永远走真实路径，
 * 不会因为账号已存在而退化成登录。
 */
export type E2eAccount = {
  name: string;
  email: string;
  password: string;
};

export function makeAccount(role: "owner" | "intruder"): E2eAccount {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  return {
    name: role === "owner" ? "E2E 文档作者" : "E2E 越权访客",
    email: `e2e-${role}-${stamp}@taskflow.local`,
    password: `Passw0rd-${stamp}`,
  };
}

export const OWNER_STATE = "tests/e2e/.auth/owner.json";
export const INTRUDER_STATE = "tests/e2e/.auth/intruder.json";

async function submitRegister(page: Page, account: E2eAccount) {
  await page.goto("/register");
  await page.getByLabel("昵称").fill(account.name);
  await page.getByLabel("邮箱").fill(account.email);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: "创建账号" }).click();

  // 注册成功会签发会话并跳进受保护 区；失败（限流/字段错误）则停留在注册页
  await page.waitForURL(/\/(issues|documents)/, { timeout: 30_000 });
}

async function submitLogin(page: Page, account: E2eAccount) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(account.email);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/\/(issues|documents)/, { timeout: 30_000 });
}

/** 注册并落地 storageState，供 storageState 复用会话，避免每条用例都走一遍注册限流。 */
export async function registerAndSaveState(page: Page, account: E2eAccount, statePath: string) {
  await submitRegister(page, account);
  await page.context().storageState({ path: statePath });
}

/** 用已有账号登录并落地 storageState。 */
export async function loginAndSaveState(page: Page, account: E2eAccount, statePath: string) {
  await submitLogin(page, account);
  await page.context().storageState({ path: statePath });
}

export async function login(page: Page, account: E2eAccount) {
  await submitLogin(page, account);
}
