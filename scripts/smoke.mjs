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
 *  7. 第 2/3 梯队：Issue CRUD、列表与看板 SSR、跨 Workspace 越权
 *  8. 第 4 梯队：AI 拆分（mock 成功 / 无效输出 / 超时 / 限流）与 AI 面板 SSR
 *  9. 认证限流：登录按邮箱的失败计数、换邮箱不受影响、注册按 IP 的尝试计数
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

async function submitForm(url, formHtml, extraFields, cookieHeader, extraHeaders = {}) {
  if (!formHtml) throw new Error("未找到目标表单，无法提交");

  const body = new FormData();
  for (const [name, value] of hiddenFieldsOf(formHtml)) body.append(name, value);
  for (const [name, value] of Object.entries(extraFields)) body.append(name, value);

  return fetch(url, {
    method: "POST",
    headers: { cookie: cookieHeader, ...extraHeaders },
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

/** 读取 .env 中的单个键；进程环境优先，取不到则用兜底值 */
function loadEnvValue(key, fallback) {
  if (process.env[key] !== undefined && process.env[key] !== "") return process.env[key];

  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const line = text.split(/\r?\n/).find((row) => row.trim().startsWith(`${key}=`));
    if (!line) return fallback;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return fallback;
  }
}

/**
 * 第 4 梯队：AI 拆分（P0-10）与限流。
 *
 * 前置：服务端 AI_PROVIDER=mock（或已配置 AI_API_KEY）。mock 模式下 prompt 关键字驱动分支：
 * 含 INVALID → 上游输出不合法；含 TIMEOUT → 上游挂起直到 AbortController 触发（真实超时链路）。
 *
 * 限流用例刻意换一个账号：限流按 userId 分桶，用独立账号才能在不干扰功能用例的前提下把额度打满。
 */
async function runAiChecks(primaryJar) {
  const endpoint = `${BASE_URL}/api/ai/breakdown`;
  const post = (prompt, cookieHeader) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ prompt }),
    });

  // 0. 前置：AI 能力必须是启用的，否则后面的断言失败会指向环境问题而不是代码问题
  const health = await (await fetch(`${BASE_URL}/api/health`)).json();
  const aiDisabled = (health.disabledFeatures ?? []).includes("ai");
  check(
    "AI 能力已启用（AI_PROVIDER=mock 或已配置 AI_API_KEY）",
    !aiDisabled,
    `disabledFeatures=${JSON.stringify(health.disabledFeatures ?? [])}`
  );

  // 1. 面板必须出现在任务页 SSR 输出里（无 JS 时也能看到入口）
  const page = await fetchPage(`${BASE_URL}/issues`, primaryJar.header());
  check(
    "AI 面板已渲染在任务页（SSR 输出）",
    page.status === 200 &&
      page.html.includes("AI 拆分任务") &&
      page.html.includes('id="ai-prompt"'),
    `http=${page.status}`
  );

  // 2. 未登录：401
  const anon = await post("把这段工作拆成可执行的子任务");
  check("AI 拆分：未登录返回 401", anon.status === 401, `http=${anon.status}`);

  // 3. 过短 prompt：400，且不消耗额度
  const shortResponse = await post("太短", primaryJar.header());
  const shortBody = await shortResponse.json();
  check(
    "AI 拆分：过短 prompt 被拒（400）",
    shortResponse.status === 400 && shortBody?.error?.code === "VALIDATION_FAILED",
    `http=${shortResponse.status} code=${shortBody?.error?.code ?? "无"}`
  );

  // 4. 正常分支：结构化子任务 + Token 统计
  const okResponse = await post(
    "实现用户资料页：头像上传、昵称修改、密码重置",
    primaryJar.header()
  );
  const okBody = await okResponse.json();
  const subtasks = okBody?.data?.subtasks;
  check(
    "AI 拆分（mock）：返回结构化子任务与 Token 统计",
    okResponse.status === 200 &&
      okBody?.ok === true &&
      Array.isArray(subtasks) &&
      subtasks.length > 0 &&
      typeof subtasks[0]?.title === "string" &&
      subtasks[0].title.length > 0 &&
      typeof okBody?.data?.usage?.totalTokens === "number",
    `http=${okResponse.status} 条数=${Array.isArray(subtasks) ? subtasks.length : "无"} ` +
      `tokens=${okBody?.data?.usage?.totalTokens ?? "无"}`
  );

  // 5. 无效输出分支：502，且不得写库
  const invalidResponse = await post("INVALID 请拆解这段工作内容", primaryJar.header());
  const invalidBody = await invalidResponse.json();
  check(
    "AI 拆分：输出不合 Schema 返回 502（零写入）",
    invalidResponse.status === 502 && invalidBody?.error?.code === "AI_INVALID_OUTPUT",
    `http=${invalidResponse.status} code=${invalidBody?.error?.code ?? "无"}`
  );

  // 5b. 条数不足分支：能逐条解析但只有 2 条，违反「3-10 条」契约，同样必须 502
  const tooFewResponse = await post("TOOFEW 请拆解这段工作内容", primaryJar.header());
  const tooFewBody = await tooFewResponse.json();
  check(
    "AI 拆分：条数不足 3 条返回 502（零写入）",
    tooFewResponse.status === 502 && tooFewBody?.error?.code === "AI_INVALID_OUTPUT",
    `http=${tooFewResponse.status} code=${tooFewBody?.error?.code ?? "无"}`
  );

  // 6. 超时分支：504，走真实 AbortController 链路
  const timeoutResponse = await post("TIMEOUT 请拆解这段工作内容", primaryJar.header());
  const timeoutBody = await timeoutResponse.json();
  check(
    "AI 拆分：超时返回 504（AbortController 链路）",
    timeoutResponse.status === 504 && timeoutBody?.error?.code === "AI_TIMEOUT",
    `http=${timeoutResponse.status} code=${timeoutBody?.error?.code ?? "无"}`
  );

  // 7. 限流：独立账号把额度打满，第 limit+1 次必须 429
  const limit = Number(loadEnvValue("AI_RATE_LIMIT_PER_MINUTE", "10"));
  const secondJar = new CookieJar();
  await signInWith(secondJar, SECOND_EMAIL, SECOND_PASSWORD);
  await fetchPage(`${BASE_URL}/issues`, secondJar.header()); // 触发该账号的 Workspace 初始化

  let allowed = 0;
  let limitedStatus = 0;
  for (let index = 0; index < limit + 1; index += 1) {
    const response = await post(
      `限流验证第 ${index + 1} 次调用，请拆解这段工作`,
      secondJar.header()
    );
    if (response.status === 200) allowed += 1;
    else limitedStatus = response.status;
  }
  check(
    `AI 限流：每分钟第 ${limit + 1} 次调用被拒（429）`,
    allowed === limit && limitedStatus === 429,
    `放行=${allowed}/${limit} 超限响应=${limitedStatus}`
  );
}

/**
 * 第 4 梯队补充：认证限流（P0-01 加固）。
 *
 * 覆盖两点，都用**独立 IP 标记 + 独立邮箱**，保证可重复运行（不污染其它用例的桶）：
 * 1. 登录：同一邮箱连续失败到额度上限后，下一次必须被拒；换邮箱不受影响
 *    （证明邮箱桶独立，且「只对失败计数」不会误伤同一 IP 下的其他人）。
 * 2. 注册：同一 IP 连续尝试到额度上限后必须被拒。用已注册邮箱反复提交，
 *    返回 CONFLICT 而不产生新用户 —— 既验证限流又不污染数据库。
 *
 * 注意：本地无反向代理，x-forwarded-for 会原样透传，所以这里可以自己指定；
 * 生产必须由 Nginx 覆写该头，否则按 IP 的限流可被伪造（详见 lib/client-ip.ts）。
 */
async function runAuthRateLimitChecks() {
  const loginLimit = Number(loadEnvValue("AUTH_LOGIN_RATE_LIMIT_PER_MINUTE", "10"));
  const registerLimit = Number(loadEnvValue("AUTH_REGISTER_RATE_LIMIT_PER_MINUTE", "5"));

  const loginIp = `smoke-ip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const loginHeaders = { "x-forwarded-for": loginIp };
  const email = `smoke-ratelimit-${Date.now()}@taskflow.local`;

  const loginPage = await fetchPage(`${BASE_URL}/login`, "");
  const loginForm = extractForm(loginPage.html, "login-form");
  check(
    "登录页渲染出可回放的登录表单",
    loginPage.status === 200 && Boolean(loginForm),
    `http=${loginPage.status}`
  );

  let blockedAt = 0;
  for (let attempt = 1; attempt <= loginLimit + 1; attempt += 1) {
    const response = await submitForm(
      `${BASE_URL}/login`,
      loginForm,
      { email, password: "WrongPassword123" },
      "",
      loginHeaders
    );
    const html = await response.text();
    if (html.includes("操作过于频繁")) {
      blockedAt = attempt;
      break;
    }
  }
  check(
    `登录限流：同一邮箱第 ${loginLimit + 1} 次失败被拒`,
    blockedAt === loginLimit + 1,
    blockedAt === 0 ? "始终未被限流" : `实际在第 ${blockedAt} 次被拒`
  );

  // 换邮箱：邮箱桶独立；同一 IP 的额度也还没打满，因此应看到「密码不正确」而非限流
  const otherEmail = `smoke-ratelimit-b-${Date.now()}@taskflow.local`;
  const otherResponse = await submitForm(
    `${BASE_URL}/login`,
    loginForm,
    { email: otherEmail, password: "WrongPassword123" },
    "",
    loginHeaders
  );
  const otherHtml = await otherResponse.text();
  check(
    "登录限流：换邮箱不受影响（邮箱桶独立）",
    otherHtml.includes("邮箱或密码不正确") && !otherHtml.includes("操作过于频繁"),
    otherHtml.includes("操作过于频繁") ? "被同 IP 桶误伤" : ""
  );

  // 同一邮箱、换 IP：证明攻击者打满自己那份额度后，无法把真实用户锁在门外
  const victimIp = `smoke-ip-victim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const victimResponse = await submitForm(
    `${BASE_URL}/login`,
    loginForm,
    { email, password: "WrongPassword123" },
    "",
    { "x-forwarded-for": victimIp }
  );
  const victimHtml = await victimResponse.text();
  check(
    "登录限流：同一邮箱换 IP 不受影响（无法被锁号）",
    victimHtml.includes("邮箱或密码不正确") && !victimHtml.includes("操作过于频繁"),
    victimHtml.includes("操作过于频繁") ? "被其它 IP 的失败计数牵连" : ""
  );

  const registerIp = `smoke-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const registerHeaders = { "x-forwarded-for": registerIp };
  const registerPage = await fetchPage(`${BASE_URL}/register`, "");
  const registerForm = extractForm(registerPage.html, "register-form");
  check(
    "注册页渲染出可回放的注册表单",
    registerPage.status === 200 && Boolean(registerForm),
    `http=${registerPage.status}`
  );

  let registerBlockedAt = 0;
  for (let attempt = 1; attempt <= registerLimit + 1; attempt += 1) {
    const response = await submitForm(
      `${BASE_URL}/register`,
      registerForm,
      { name: "冒烟限流", email: TEST_EMAIL, password: "SmokeTest123" },
      "",
      registerHeaders
    );
    const html = await response.text();
    if (html.includes("操作过于频繁")) {
      registerBlockedAt = attempt;
      break;
    }
  }
  check(
    `注册限流：同一 IP 第 ${registerLimit + 1} 次尝试被拒`,
    registerBlockedAt === registerLimit + 1,
    registerBlockedAt === 0 ? "始终未被限流" : `实际在第 ${registerBlockedAt} 次被拒`
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

  // 7b. 第 4 梯队：AI 拆分与限流
  await runAiChecks(jar);

  // 7c. 认证限流（独立 IP 标记与邮箱，可重复运行）
  await runAuthRateLimitChecks();

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
