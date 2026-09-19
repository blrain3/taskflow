# TaskFlow 项目长期记忆

## 用户偏好

- **提交信息**：纯中文、一句话为主、不加 `feat/fix` 等英文前缀、最多两句话；**不写提交范围/验证结果/未验证项/风险**（改放自审记录或 PR 描述）。规则见 `docs/commit-rules.md` §3/§7。
- **提交范围**：按文件路径显式 `git add`，不用 `git add .`。
- **⛔ 默认不提交文档**：`docs/**` 与根 `README.md` 一律不提交（已两次被要求撤回），只有用户明确说「可以提交文档」才提交。代码可按显式路径提交。
- **工作模式**：倾向「先计划后编码」，大功能先出方案等确认再动手。

## 项目约定（实现相关）

- 产品名 TaskFlow（包名 `helio-app`）；目录保留根 `app/`。
- 五层单向依赖 `app→components→actions→lib→PostgreSQL`，ESLint 护栏固化；Server Action 四步：Zod→鉴权→授权→写库+`revalidatePath`；统一契约 `ActionResult<T>`；跨 Workspace 一律返回 `NOT_FOUND`。
- 状态枚举 `BACKLOG/TODO/IN_PROGRESS/DONE`，真源 `types/issue.ts`（含中文标签与徽标配色）。
- **架构事实源**：`docs/02-architecture/architecture.md` v2.0（唯一权威总纲）；决策以 `adr-001` + `adr-index.md` 为准，ADR 正文不改写；`docs/archive/develop-plan.md` 是作废草案。
- **文档状态取自 `docs/README.md` 词表**（9 个值）。Issue 域是「在产历史模块」，「历史」指交付早不代表可删。
- **术语**：统一称「任务协作域（Issue）」「文档写作域（Document）」。两域代码完全隔离，只共享 `errors.ts`+`prisma.ts`。
- **改代码同步清单**：新受保护路由→`proxy.ts` matcher；环境变量→三处（`lib/env.ts`、`.env.example`、README）；UI 契约→`ui-design-system-v2.md`；改文档→跑 `node scripts/check-doc-links.mjs`。
- **`<details>/<summary>` 承载编辑删除是有意权衡**（无 JS 可用 + SSR 可测），不要用 Dialog 替换；冒烟测 Server Action 依赖表单在 SSR 输出里（`$ACTION_REF_*` 回放技巧）。

## UI 与设计系统状态（2026-09-14 组件迁移完成）

- 令牌层已落地：`app/globals.css` 三层令牌（原始→语义→`@theme inline`，Tailwind 4.3.3 实测语义勿凭记忆改）；`layout.tsx` 已切 `data-theme="dark"`（**深色优先已启用**，2026-09-14）。
- **组件库迁移已完成**：shadcn 风格基建在 `components/ui/`（button/input/textarea/select/label/badge/skeleton/dialog/field-error/submit-button），全部接项目令牌。`Badge` 有 default/status 变体（状态配色仍由 `ISSUE_STATUS_STYLES` 传入）；`Select` 刻意不复用 `inputClassName`（placeholder:/disabled 语义不同）且无 outline-none（依赖浏览器默认焦点环）；`global-error.tsx` 内联 style 是有意的（root layout 挂时无 CSS），不要改。全仓调色板残留为零、裸 button/select/手写徽标/骨架均已收口。
- 审计 `docs/05-design-assets/ui-quality-audit.md`（4.5/10，根因：架构有护栏、UI 零约束）；ADR-006（shadcn/ui + Radix，停更组件切 Base UI）**已接受**。
- **lint 护栏已落地**：`taskflow-ui/no-palette-classes`（eslint.config.mjs 本地规则，零依赖）禁硬编码调色板/white-black 类名，检查所有字符串字面量+模板串（不限 className）；曾抓到 dialog.tsx 遮罩 `bg-black/50`，已改 `bg-scrim` 令牌（三层已补，规范 §3.2.1 已同步）。
- **焦点契约已全站统一（2026-09-14）**：`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`（CSS 原生 outline，= 规范「2px --focus-ring + 2px offset」）。**勿写常驻 `outline-none`/`outline-hidden` 与 `focus-visible:ring-*` 混用**——两者都会把 `--tw-outline-style` 污染成 none 杀掉焦点环（Tailwind 4.3 实测）；ring/offset 是 box-shadow 变量组合，与 shadow-elev 共存有常驻色圈风险，故弃用 ring 方案。inline 文本链接保留浏览器 outline（inline 套环是反模式，合规）。
- **下一步**：先补 lint 护栏（禁硬编码调色板类名）再做组件大规模替换；迁移后遗留差异（select 无 focus 环、pill 切换器仍是内联）待统一。

## 环境与工具链

- **`npm`/`npx`/`npm run` 被安全策略拦截**（拉起 wsl.exe 乱码）——**「我无法代跑」≠「装不了」**，需要装依赖时给命令让用户在自己终端跑。沙箱内直接调入口文件：`node ./node_modules/{prisma/build/index.js, eslint/bin/eslint.js, prettier/bin/prettier.cjs, next/dist/bin/next.js}`。
- **`docker-compose`（v5.5.1）不是 `docker compose`**；`docker inspect --format` 输出模板字面量，用 `docker-compose ps` 看健康。
- **Prisma 连容器库必须 `127.0.0.1`**（localhost 解析 IPv6 会卡 5s）；离线迁移用 `prisma migrate diff --from-schema-datamodel`；`prisma generate` 不需要 DATABASE_URL；**Prisma 固定 6.x**（7 的依赖链装不上）。
- **构建不得依赖运行时配置**：模块加载期读 env 会让无 `.env` 的 build 失败（已实测）。`next build` 在沙箱内会失败（safe-delete 保护）。
- **Next.js 16**：Turbopack 默认；`next lint` 已移除；`cookies()/headers()/params/searchParams` 全异步；`middleware`→`proxy`；布局客户端导航不重新执行且与 page 并发渲染。**Auth.js v5**：Credentials 只支持 JWT；PrismaAdapter 在此模式不被调用。
- `.dockerignore` 必需；CSS 工具在 `@dnd-kit/utilities`；新版 react-hooks 规则：禁 effect 内同步 setState（用渲染期对齐）、禁 useCallback 自引用。

## 验证手段

- `node scripts/smoke.mjs`：HTTP 冒烟，**项数随环境自适应，不要写死数字**。覆盖健康检查/重定向/CSRF/登录注册限流（IP 桶+邮箱+IP 组合桶）/Workspace 初始化/并发回归/Issue CRUD/越权/AI 各分支。
- 容器链路：`docker-compose up -d --build` → `docker-compose ps` healthy → 冒烟（会写 smoke@taskflow.local 两账号，勿在生产库跑）。

## 当前进度

双域均在产：任务协作域（看板/拖拽/AI 拆解）+ 文档写作域（单人写作 MVP）。

- **文档收口已提交**（`f6966a3`，2026-09-14）；**工作区仍有未提交源码重构**：`lib/{rate-limit,errors,permissions,ai-parser,documents,logger}.ts`、`actions/{issue,_contract}.ts`、`prisma/migrations/20260914082000_workspace_member_role_enum/`（**迁移未执行**）、`eslint.config.mjs`、`scripts/smoke.mjs`、`tests/unit/*`、`package.json`。
- **⚠️ 并行写入渠道活跃**：会自行 commit、可能宽范围 add、会重写 MEMORY.md。动作前先 `git status`；只按显式路径 add；共享文件预期被并发覆盖，读后改动要重读。
- **已知技术债**（总纲 §16.2）：限流单实例内存、无游标分页、`actions/document.ts` 未接入统一契约、AI 走文本解析（宜 `generateObject`）、写作域 AI 未实现、Playwright 覆盖薄。
- **下一步候选**：① 确认并提交工作区改动；② Docker 可用后跑迁移+build+冒烟；③ P0-4 分页；④ 写作域 AI 闭环；⑤ 深色主题下人工过一遍全站视觉（切换已启用，尚未目检）。
