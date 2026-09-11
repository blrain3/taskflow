#!/usr/bin/env node
/**
 * TaskFlow HTTP 冒烟测试（不依赖浏览器，可在 CI 里跑）
 *
 * 覆盖：
 *  1. 健康检查（必需变量齐备 + 数据库可达）
 *  2. 未登录访问受保护路由必须重定向到 /login
 *  3. 凭据登录签发会话 Cookie
 *  4. 带会话可访问受保护页面，且页面内容来自数据库
 *  5. 未登录时 /api/auth/session 返回空
 *  6. 登出后会话失效
 *
 * 用法：
 *  node scripts/smoke.mjs                 # 默认 http://localhost:3000
 *  node scripts/smoke.mjs http://host:3000
 *
 * 前置：数据库已迁移。脚本会用固定测试账号 direct-write 到数据库，
 * 因此不要在生产库上运行。
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const TEST_EMAIL = "smoke@taskflow.local";
const TEST_PASSWORD = "SmokeTest123";
const TEST_NAME = "冒烟测试账号";
const SECOND_EMAIL = "smoke-b@taskflow.local";
const SECOND_PASSWORD = "SmokeTest123";
const SECOND_NAME = "越权测试账号";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = text.split(/\r?\n/).find((row) => row.startsWith("DATABASE_URL="));
  if (!line) throw new Error("未在 .env 中找到 DATABASE_URL");
  return line
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

class CookieJar {
  #cookies = new Map();

  absorb(response) {
    const list = response.headers.getSetCookie?.() ?? [];
    for (const raw of list) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header() {
    return [...this.#cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name) {
    return [...this.#cookies.keys()].some((key) => key.includes(name));
  }

  clear() {
    this.#cookies.clear();
  }
}

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function seedTestUser() {
  const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
  try {
    const passwordHash = await hash(TEST_PASSWORD, 10);
    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash, name: TEST_NAME },
      create: { email: TEST_EMAIL, name: TEST_NAME, passwordHash },
      select: { id: true },
    });

    // 清理该账号的历史工作区，保证「首次进入自动初始化 Workspace」每次都被真实执行到
    await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function countWorkspacesOf(userId) {
  const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
  try {
    return await prisma.workspace.count({ where: { ownerId: userId } });
  } finally {
    await prisma.$disconnect();
  }
}

/** 重建第二个账号，用于验证跨 Workspace 越权被拒绝（外键级联会清掉它的工作区与任务） */
async function seedSecondUser() {
  return withPrisma(async (prisma) => {
    await prisma.user.deleteMany({ where: { email: SECOND_EMAIL } });

    const passwordHash = await hash(SECOND_PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: SECOND_EMAIL, name: SECOND_NAME, passwordHash },
      select: { id: true },
    });
    return user.id;
  });
}

async function withPrisma(fn) {
  const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function findWorkspaceIdOf(userId) {
  const membership = await withPrisma((prisma) =>
    prisma.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } })
  );
  return membership?.workspaceId ?? null;
}

async function findIssueById(id) {
  return withPrisma((prisma) =>
    prisma.issue.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, workspaceId: true },
    })
  );
}

async function countIssuesOf(workspaceId) {
  return withPrisma((prisma) => prisma.issue.count({ where: { workspaceId } }));
}

// ---- Server Action 的「无 JS 表单提交」通道 ----
// Next 的渐进增强会把 action 引用编码进表单的隐藏字段（$ACTION_REF_* / $ACTION_*:n）。
// 原样回放这些字段 + 业务字段，就能在不依赖浏览器的情况下真实触发 Server Action。

function extractForm(html, formId) {
  const anchor = html.indexOf(`id="${formId}"`);
  if (anchor === -1) return null;

  const open = html.lastIndexOf("<form", anchor);
  const close = html.indexOf("</form>", anchor);
  if (open === -1 || close === -1) return null;

  return html.slice(open, close + "</form>".length);
}

const HTML_ENTITIES = {
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

function decodeEntities(value) {
  return value.replace(/&(quot|#x27|#39|lt|gt|amp);/g, (match) => HTML_ENTITIES[match] ?? match);
}

function hiddenFieldsOf(formHtml) {
  const fields = [];
  const pattern = /<input[^>]*type="hidden"[^>]*>/g;
  let match;

  while ((match = pattern.exec(formHtml)) !== null) {
    const tag = match[0];
    const name = /\sname="([^"]*)"/.exec(tag)?.[1];
    if (!name) continue;

    const value = /\svalue="([^"]*)"/.exec(tag)?.[1] ?? "";
    fields.push([decodeEntities(name), decodeEntities(value)]);
  }

  return fields;
}

async function submitForm(url, formHtml, extraFields, cookieHeader) {
  if (!formHtml) throw new Error("未找到目标表单，无法提交");

  const body = new FormData();
  for (const [name, value] of hiddenFieldsOf(formHtml)) body.append(name, value);
  for (const [name, value] of Object.entries(extraFields)) body.append(name, value);

  return fetch(url, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body,
    redirect: "manual",
  });
}

async function fetchPage(url, cookieHeader) {
  const response = await fetch(url, { headers: { cookie: cookieHeader } });
  return { status: response.status, html: await response.text() };
}

/** 走一遍 CSRF + 凭据登录，返回是否拿到会话 Cookie */
async function signInWith(jar, email, password) {
  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.absorb(csrfResponse);
  const { csrfToken } = await csrfResponse.json();

  const response = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE_URL}/issues`,
    }),
    redirect: "manual",
  });
  jar.absorb(response);
  return response;
}

/** 第 2 梯队：Issue CRUD 与跨 Workspace 越权 */
async function runIssueCrudChecks(primaryJar, primaryUserId) {
  const issuesUrl = `${BASE_URL}/issues`;
  const workspaceId = await findWorkspaceIdOf(primaryUserId);
  const baseline = await countIssuesOf(workspaceId);
  const title = `冒烟任务-${Date.now()}`;

  let page = await fetchPage(issuesUrl, primaryJar.header());
  const createForm = extractForm(page.html, "create-issue-form");
  check(
    "任务页渲染出创建表单（渐进增强可用）",
    page.status === 200 && Boolean(createForm),
    `http=${page.status}`
  );

  // 创建
  await submitForm(
    issuesUrl,
    createForm,
    { title, description: "由冒烟脚本创建" },
    primaryJar.header()
  );
  const created = await withPrisma((prisma) =>
    prisma.issue.findFirst({
      where: { workspaceId, title },
      select: { id: true, status: true, description: true },
    })
  );
  check(
    "创建任务：已落库且默认状态为 BACKLOG",
    created?.status === "BACKLOG" && created?.description === "由冒烟脚本创建",
    created ? `id=${created.id} status=${created.status}` : "未写入"
  );

  // 看板视图（P0-08）：客户端组件也会 SSR 输出，四列标题与新卡片都应出现在 HTML 里
  const boardPage = await fetchPage(`${issuesUrl}?view=board`, primaryJar.header());
  const boardColumnsOk = ["待整理", "待开始", "进行中", "已完成"].every((label) =>
    boardPage.html.includes(label)
  );
  check(
    "看板视图 SSR 渲染四列与新卡片",
    boardPage.status === 200 && boardColumnsOk && boardPage.html.includes(title),
    `http=${boardPage.status} columns=${boardColumnsOk}`
  );

  // 空标题：应被 Zod 拦下，不产生记录
  const emptyForm = extractForm(
    (await fetchPage(issuesUrl, primaryJar.header())).html,
    "create-issue-form"
  );
  await submitForm(issuesUrl, emptyForm, { title: "   ", description: "" }, primaryJar.header());
  check(
    "空标题被拒绝，未产生记录",
    (await countIssuesOf(workspaceId)) === baseline + 1,
    `count=${await countIssuesOf(workspaceId)}`
  );

  // 超长标题：应被 Zod 拦下
  const longForm = extractForm(
    (await fetchPage(issuesUrl, primaryJar.header())).html,
    "create-issue-form"
  );
  await submitForm(
    issuesUrl,
    longForm,
    { title: "长".repeat(201), description: "" },
    primaryJar.header()
  );
  check(
    "超长标题（201 字）被拒绝",
    (await countIssuesOf(workspaceId)) === baseline + 1,
    `count=${await countIssuesOf(workspaceId)}`
  );

  // 编辑
  page = await fetchPage(issuesUrl, primaryJar.header());
  const editForm = extractForm(page.html, `update-issue-form-${created.id}`);
  check("编辑表单存在于 SSR 输出中", Boolean(editForm));

  await submitForm(
    issuesUrl,
    editForm,
    { title: `${title}（已改）`, description: "改过了", status: "IN_PROGRESS" },
    primaryJar.header()
  );
  const updated = await findIssueById(created.id);
  check(
    "编辑任务：标题与状态均已更新",
    updated?.title === `${title}（已改）` && updated?.status === "IN_PROGRESS",
    `title=${updated?.title} status=${updated?.status}`
  );

  // 跨 Workspace 越权：拿 B 的会话去提交 A 的表单编码
  const secondUserId = await seedSecondUser();
  const secondJar = new CookieJar();
  await signInWith(secondJar, SECOND_EMAIL, SECOND_PASSWORD);
  await fetchPage(issuesUrl, secondJar.header()); // 触发 B 自己的 Workspace 初始化
  const secondWorkspaceId = await findWorkspaceIdOf(secondUserId);

  const forged = await submitForm(
    issuesUrl,
    editForm,
    { title: "越权改名", description: "", status: "DONE" },
    secondJar.header()
  );
  const forgedHtml = await forged.text();
  const afterForged = await findIssueById(created.id);
  check(
    "跨 Workspace 编辑被拒绝，且目标数据未被改动",
    afterForged?.title === `${title}（已改）` && afterForged?.status === "IN_PROGRESS",
    `title=${afterForged?.title} status=${afterForged?.status} 响应提示=${
      forgedHtml.includes("目标不存在") ? "NOT_FOUND" : "未出现预期提示"
    }`
  );
  check(
    "越权尝试未在 B 的工作区留下数据",
    (await countIssuesOf(secondWorkspaceId)) === 0,
    `bIssues=${await countIssuesOf(secondWorkspaceId)}`
  );

  // 删除
  page = await fetchPage(issuesUrl, primaryJar.header());
  const deleteForm = extractForm(page.html, `delete-issue-form-${created.id}`);
  check("删除表单存在于 SSR 输出中", Boolean(deleteForm));

  await submitForm(issuesUrl, deleteForm, {}, primaryJar.header());
  check("删除任务：记录已消失", (await findIssueById(created.id)) === null);
  check(
    "删除后工作区任务数回到基线",
    (await countIssuesOf(workspaceId)) === baseline,
    `count=${await countIssuesOf(workspaceId)}`
  );
}

async function main() {
  console.log(`冒烟目标：${BASE_URL}\n`);
  const userId = await seedTestUser();
  const jar = new CookieJar();

  // 1. 健康检查
  const health = await fetch(`${BASE_URL}/api/health`);
  const healthBody = await health.json();
  check(
    "健康检查返回 200 且 status=ok",
    health.status === 200 && healthBody.status === "ok",
    `http=${health.status} database=${healthBody.database} missingEnv=${JSON.stringify(healthBody.missingEnv)}`
  );

  // 2. 未登录访问受保护路由
  const guarded = await fetch(`${BASE_URL}/issues`, { redirect: "manual" });
  const location = guarded.headers.get("location") ?? "";
  check(
    "未登录访问 /issues 重定向到 /login",
    (guarded.status === 307 || guarded.status === 302) && location.includes("/login"),
    `http=${guarded.status} location=${location}`
  );

  // 3. 未登录的 session 必须为空
  const anonSession = await fetch(`${BASE_URL}/api/auth/session`);
  const anonBody = await anonSession.json();
  check("未登录时 /api/auth/session 为空", !anonBody || !anonBody.user, JSON.stringify(anonBody));

  // 4. 取 CSRF 并登录
  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.absorb(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  check("取得 CSRF token", typeof csrfToken === "string" && csrfToken.length > 0);

  const loginBody = new URLSearchParams({
    csrfToken,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    callbackUrl: `${BASE_URL}/issues`,
  });
  const loginResponse = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body: loginBody,
    redirect: "manual",
  });
  jar.absorb(loginResponse);

  const sessionCookieName = [...(loginResponse.headers.getSetCookie?.() ?? [])]
    .map((raw) => raw.split("=")[0])
    .find((name) => name.includes("session-token"));
  check(
    "登录成功后签发会话 Cookie",
    Boolean(sessionCookieName),
    `http=${loginResponse.status} cookie=${sessionCookieName ?? "未签发"}`
  );

  // 5. 登录后 session 应包含用户
  const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { cookie: jar.header() },
  });
  const sessionBody = await sessionResponse.json();
  check(
    "登录后 /api/auth/session 返回当前用户",
    sessionBody?.user?.id === userId,
    `sessionUserId=${sessionBody?.user?.id ?? "无"}`
  );

  // 6. 登录后可访问受保护页面，且 Workspace 已自动初始化
  const issues = await fetch(`${BASE_URL}/issues`, {
    headers: { cookie: jar.header() },
    redirect: "manual",
  });
  const issuesHtml = issues.status === 200 ? await issues.text() : "";
  check(
    "登录后可访问 /issues 且已自动初始化 Workspace",
    issues.status === 200 && issuesHtml.includes("当前工作区"),
    `http=${issues.status}`
  );

  // 6b. 回归断言：Next 并发渲染 layout 与 page，曾因此给同一用户建出两个工作区
  const workspaceCount = await countWorkspacesOf(userId);
  check(
    "同一用户只自动创建 1 个 Workspace（并发渲染回归）",
    workspaceCount === 1,
    `workspaceCount=${workspaceCount}`
  );

  // 7. 第 2 梯队：Issue CRUD 与跨 Workspace 越权
  await runIssueCrudChecks(jar, userId);

  // 8. 登出后会话失效
  const signOutCsrf = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: { cookie: jar.header() },
  });
  jar.absorb(signOutCsrf);
  const { csrfToken: signOutToken } = await signOutCsrf.json();
  const signOutResponse = await fetch(`${BASE_URL}/api/auth/signout`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body: new URLSearchParams({ csrfToken: signOutToken, callbackUrl: BASE_URL }),
    redirect: "manual",
  });
  jar.absorb(signOutResponse);

  const afterSignOut = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { cookie: jar.header() },
  });
  const afterSignOutBody = await afterSignOut.json();
  check(
    "登出后会话失效",
    !afterSignOutBody || !afterSignOutBody.user,
    JSON.stringify(afterSignOutBody ?? null)
  );

  const failed = results.filter((item) => !item.passed);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("冒烟测试异常终止：", error);
  process.exitCode = 1;
});
