# TaskFlow UI 质量审计报告

> 审计对象：当前仓库已实现界面（`app/`、`components/`、`hooks/`）
> 审计基准：`docs/05-design-assets/ui-design-system-v2.md`、`docs/01-product/user-stories.md`、WCAG 2.1 AA
> 审计时间：2026-09-11
> 综合评分：**4.5 / 10**

> **状态更新（2026-09-12 · 第二批整改后）**：本报告为时点快照，正文评分与结论不随后续修复改写。shadcn/ui 迁移（ADR-006）启动后：
> **已修复**：P0-1（三层令牌已落地 `app/globals.css`）、P0-2（主题改为 `[data-theme]` 驱动）、P0-3（任务页两种视图统一 `max-w-6xl`，骨架与页面必然对齐）、P0-4（看板容器放宽并注明算式，后统一为 `max-w-6xl`）、P0-6（焦点样式统一 `ring-focus`，调色板字面量已清除）、P0-7（`FieldError` 支持 `id`，全部表单已接线 `aria-describedby`）、P0-8（文字对比度随令牌达标）、P1-10（按钮统一为 `components/ui/button.tsx` cva 变体）、P2-24（文档路径已修正）、P2-25（归因注释已修正）。
> **未修复**：P0-5（`touch-none` 阻断移动端滚动）、P1-13（提交按钮宽度未锁定）、P1-15（AI 拆解已有骨架外的取消能力，骨架屏待补）、P2-19（⌘K 命令面板）、P2-21（看板列快速新建）、P2-22（动效令牌）等 §3、§4 项。进度以 `../02-architecture/adr-006-component-library.md` §8 验收清单为准。

---

## 0. 结论摘要

界面**功能完整、语义结构扎实、异步状态处理超出预期**（乐观更新 + 快照回滚 + 键盘拖拽都真实可用）。问题不在"做得少"，而在**设计系统停留在文档层，实现层没有承接机制**：

- 规范文档定义了完整的三层令牌体系，`app/globals.css` 却仍是 create-next-app 模板；
- 全站颜色是散落的 Tailwind 字面量，导致同一个「按钮」有 5 套实现、同一个「输入框焦点」有 3 套样式；
- 深色模式在实现层完全失效（可复现的视觉崩坏）；
- 应用外壳不存在，四个功能模块挤在 `/issues` 一个页面里。

**评分构成**

| 维度 | 得分 | 一句话结论 |
|---|---|---|
| 一致性 | 3.0 / 10 | 无令牌层；按钮 5 套、焦点 3 套、容器宽度 5 套 |
| 可用性 | 5.0 / 10 | 表单模式统一；但无导航、空状态无动作、反馈不一致 |
| 视觉规范 | 4.0 / 10 | 克制清爽；但 5 个强调色无层级、圆角间距不成系统、深色失效 |
| 响应式 | 4.0 / 10 | 有断点意识；但看板列宽算错、骨架宽度不符、移动端无降级 |
| 无障碍 | 5.0 / 10 | 语义标签与键盘拖拽扎实；错误未关联、对比度不达标 |
| 工程护栏 | 6.0 / 10 | 架构分层被 ESLint 强制；UI 一致性零约束 |

---

## 1. 先说做得好的部分

审计应当承认有效实践，否则无法区分"该保留"和"该重写"。以下五项是当前实现的真实优势，重构时应作为约束保留。

| # | 实践 | 证据 | 为什么值得保留 |
|---|---|---|---|
| G1 | **语义化 HTML 扎实** | `(dashboard)/issues/page.tsx:35-61` 用 `<header>` / `<nav aria-label="视图切换">` / `<section aria-labelledby>`；`BoardColumn.tsx:36` 有 `aria-label`；`FieldError.tsx:6` 用 `role="alert"`；`IssueRow.tsx:138` 用 `role="status"` | 无障碍基线不是从零开始，只需补关联关系 |
| G2 | **渐进增强的数据结构设计** | `IssueRow.tsx:61-170` 用原生 `<details>/<summary>` 承载编辑与删除，而非受控弹窗 | 无 JS 可用、无需本地 state、表单存在于 SSR 输出中因而可被自动化测试触达。这是刻意权衡，不是偷懒 |
| G3 | **状态单一真源** | `types/issue.ts:8-25` 集中定义枚举、中文标签、样式 | 结构上正确，只需把值从字面量类名换成令牌引用 |
| G4 | **乐观更新实现严谨** | `Board.tsx:65-135` + `hooks/useBoardMove.ts`：`onDragStart` 快照全量镜像、`onDragOver` 跨列预演、原地放下不发请求、失败回滚、`onDragCancel` 恢复 | 这是全项目对异步一致性要求最高的链路，实现质量明显高于 UI 层平均水平 |
| G5 | **键盘拖拽真实可用** | `Board.tsx:50` 注册 `KeyboardSensor`；`IssueCard.tsx:37` 注释说明 Space 提起 + 方向键移动 | 无障碍不是"以后再说"，已经落地 |
| G6 | **表单三件套复用一致** | `IssueForm.tsx`、`IssueRow.tsx`、`login-form.tsx` 三处都走 `label + Input + FieldError + FormError + SubmitButton` | 说明 `components/ui/` 的抽象方向是对的，只要扩大覆盖范围 |

> **重要区分**：漂移集中发生在**页面级与功能级组件**（落地页、任务页、AI 面板、看板错误条），而**表单类组件是全站最一致的**。这说明问题不是"开发者不会抽象"，而是**缺乏令牌层 + 缺乏护栏**。

---

## 2. 一致性问题（评分 3.0）

### 2.1 设计令牌层完全缺失【严重】

`app/globals.css` 全文只有 26 行，仍是脚手架模板：

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}
```

- 只有 2 个变量，且只服务于 `body` 的底色与文字色。
- `ui-design-system-v2.md` 定义的 30+ 语义令牌（`--bg-canvas`、`--text-secondary`、`--brand-500`、`--status-*` 等）**一个都没有进入代码**。
- 所有颜色都是 Tailwind 字面量：`zinc-900`、`blue-500`、`emerald-600`、`amber-600`、`red-700`……

**这是后面所有一致性问题的共同源头。** 没有可引用的语义层，每个组件只能各自硬编码，漂移是必然结果而非偶然失误。

### 2.2 按钮有 5 套并行实现【严重】

| # | 位置 | 样式 | 圆角 |
|---|---|---|---|
| 1 | `components/ui/button.tsx:6-7` | `bg-zinc-900 text-white` / `border-zinc-300` | `rounded-lg` |
| 2 | `app/page.tsx:22,28` | `bg-zinc-900 px-5 py-2.5` | `rounded-full` |
| 3 | `app/(dashboard)/issues/page.tsx:28-31`（`pill` 函数） | `bg-zinc-900` / `border-zinc-300` | `rounded-full` |
| 4 | `components/issue/AiBreakdownPanel.tsx:185,195` | `bg-zinc-900` / `bg-emerald-600` | `rounded-full` |
| 5 | `components/board/Board.tsx:145-158` | 裸 `<button>` + `border-red-300` | `rounded` |

**漂移表现**：圆角在 `rounded-lg` 与 `rounded-full` 之间摇摆；主操作色在 `zinc-900` 与 `emerald-600` 之间摇摆（AI 面板的「确认创建」用了绿色，与全站主色不一致，且暗示"成功"语义）；第 5 处完全绕过组件，连变体机制都没有。

### 2.3 输入框焦点样式有 3 套 + 1 套缺失【严重】

| 位置 | 焦点样式 | 对比度评估 |
|---|---|---|
| `components/ui/input.tsx:5` | `focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200` | `zinc-200` 对白底约 1.3:1，**远低于 WCAG 要求的 3:1** |
| `AiBreakdownPanel.tsx:173` | `focus:border-blue-500 focus:ring-2 focus:ring-blue-200` | 与上面完全不同 |
| `AiBreakdownPanel.tsx:243,256` | `focus:border-blue-500 focus:ring-1 focus:ring-blue-200` | 连 ring 宽度都不同（1px vs 2px） |
| `IssueCard.tsx:51` | `focus-visible:ring-2 focus-visible:ring-blue-500` | 第三个色系 |
| `components/ui/button.tsx` | **无任何焦点样式定义** | 依赖浏览器默认 outline，与全站脱节 |

同一产品里，用户按 Tab 键会看到 4 种不同的焦点表现。这是最容易被评审察觉的专业度缺口。

### 2.4 页面标题字号有 3 套

| 页面 | 字号 | 位置 |
|---|---|---|
| 公开落地页 | `text-3xl` | `app/page.tsx:12` |
| 登录页 | `text-2xl` | `app/(auth)/login/page.tsx:11` |
| 任务页 | `text-xl` | `app/(dashboard)/issues/page.tsx:37` |

三处都是页面唯一的 `<h1>`，却没有统一的页面标题尺度。

### 2.5 容器宽度有 5 套

| 区域 | 宽度 | 位置 |
|---|---|---|
| 任务页 | `max-w-5xl`（1024px） | `issues/page.tsx:34` |
| 加载骨架 | `max-w-3xl`（768px） | `issues/loading.tsx:7` |
| 错误页 | `max-w-3xl`（768px） | `issues/error.tsx:23` |
| 落地页 | `max-w-2xl` | `app/page.tsx:10` |
| 认证区 | `max-w-sm` | `(auth)/layout.tsx:7` |

其中 `max-w-5xl` 与 `max-w-3xl` 的不一致直接导致了 §5.2 的布局跳动缺陷。

### 2.6 反馈模式有 4 种

| 场景 | 反馈方式 | 位置 |
|---|---|---|
| 创建成功 | **静默清空表单，无任何提示** | `IssueForm.tsx:18-22` |
| 行内编辑成功 | 表单内绿色文字「已保存」 | `IssueRow.tsx:137-141` |
| 拖拽失败 | 页内红色横幅 + 重试/忽略 | `Board.tsx:139-160` |
| AI 创建成功 | 页内绿色段落 | `AiBreakdownPanel.tsx:211-220` |

四种位置（表单内 / 页内顶部 / 页内中部）、三种颜色、四种形态。缺少统一的 Toast 层。

### 2.7 圆角与间距不成系统

- **圆角三档混用**：`rounded`（4px，`AiBreakdownPanel.tsx:243` 的子任务输入框）、`rounded-lg`（8px，多数）、`rounded-full`（按钮）。同一个 AI 面板内，主输入框是 8px、子任务输入框是 4px。
- **内边距无刻度**：`px-4 py-2`、`px-5 py-2.5`、`px-4 py-1.5`、`px-3 py-2`、`px-2 py-1` 并存，没有 4px 基准的命名刻度可引用。
- **布局职责泄漏**：`input.tsx:4` 把 `mt-1` 写进组件类名。组件不该决定自己与上方元素的距离——这会在不同上下文里产生入侵式的间距。

### 2.8 状态色未抽象，且注释存在错误归因

`types/issue.ts:19-25` 的单一真源设计是对的，但：

```ts
/** 徽标配色：中文股票约定下「已完成」用绿，进程类用蓝/琥珀 */
```

「已完成用绿」是任务看板的通用惯例，**与股票红涨绿跌无关**——那条惯例只适用于金融行情涨跌。这个归因会误导后续维护者。建议改为「用色彩惯例降低认知成本，且颜色不单独承载语义」。

### 2.9 代码内的文档路径已失效

`docs/` 已按 `01-product` ~ `05-design-assets` 重组，但注释未同步：

- `(dashboard)/layout.tsx:8` → 引用 `docs/architecture.md`，实际在 `docs/02-architecture/architecture.md`
- `eslint.config.mjs:7` → 同上。这条注释正是分层规则的**依据来源**，路径失效会让规则失去可追溯性

---

## 3. 可用性问题（评分 5.0）

### 3.1 应用外壳不存在，四个模块挤在一个页面【严重】

`(dashboard)/layout.tsx:20-39` 的全部结构只有：

```
<div flex-col>
  ├─ <header>  TaskFlow · 工作区名 · 用户名 · 登出
  └─ <main>    {children}
</div>
```

**没有侧边栏、没有跨页导航、没有工作区切换器、没有搜索入口。**

后果是 `/issues` 一页承担了四件事（`issues/page.tsx:33-66`）：视图切换 pill → 创建表单 → 看板/列表 → AI 面板，全部纵向堆叠。**AI 拆解是本项目唯一的差异化能力，却被排在页面最底部**——演示时必须滚动才能看到，直接违背 `mvp-scope.md` 里「5 分钟演示完整闭环」的出口条件。

### 3.2 空状态没有动作【严重】

`IssueList.tsx:9-16`：

```tsx
<p className="text-sm font-medium text-zinc-800">还没有任务</p>
<p className="mt-1 text-sm text-zinc-500">用上面的表单创建第一个任务吧。</p>
```

纯文字，**没有任何按钮**。用户被告知"用上面的表单"，但没有可点击的入口。规范文档明确要求「不得出现无主动作的空状态」。

看板空列（`BoardColumn.tsx:63-67`）提示「拖一张卡片到这里」：在触屏设备上这是**错误引导**（移动端没有拖拽），且同样没有快速创建入口。

### 3.3 创建成功零反馈

`IssueForm.tsx:18-22` 成功后仅执行 `formRef.current?.reset()`。用户提交后表单清空，但**没有任何「已创建」确认**，只能靠列表是否变化来推断操作是否成功。对比 `IssueRow.tsx:137` 的编辑成功有「已保存」提示——同一个产品里两种标准。

### 3.4 提交按钮改变宽度导致抖动

`SubmitButton.tsx:28`：

```tsx
{pending ? pendingText : children}
```

文案从「创建任务」（4 字）换成「创建中…」（4 字 + 省略号），按钮宽度随之变化，提交瞬间按钮跳动。同类问题在 `IssueRow` 的「保存 → 保存中…」、`AiBreakdownPanel` 的「确认创建 N 个任务 → 创建中…」都存在。

### 3.5 AI 拆解不可取消、无骨架屏

`AiBreakdownPanel.tsx:82-108` 的 `fetch` 没有 `AbortController`，界面上也没有取消按钮。加载态仅体现为按钮文案变化（`:187`），结果区域是一片空白：

- 违背规范流程 E「分析中：骨架屏占位 + 可见的取消按钮」；
- AI 调用可能耗时数秒，期间用户只能等待，无法中断。

### 3.6 表单无客户端校验反馈

`IssueForm.tsx:25` 使用 `<form noValidate>`，同时输入框带 `required` 与 `maxLength={200}`。浏览器校验被显式关闭，而**没有引入任何替代的客户端校验**。用户必须提交后才能得知"标题超长"，而不是在输入时就被提示。

### 3.7 删除采用二次确认而非可撤销

`IssueRow.tsx:155-168` 展开 `<details>` 后，还要再点一次「确认删除」。对一个高频操作多一次点击。规范建议「执行 + 5 秒撤销」，成本更低且更符合"移动端优先容错"的现代取向。

> 注：这是**设计取向差异**而非缺陷。当前实现是明确选择（`IssueRow.tsx:156` 文案「该操作不可撤销」），若要保留二次确认需同步修改规范文档，避免两份依据冲突。

### 3.8 看板列不能快速新建

`BoardColumn.tsx:41-48` 的列头只有状态徽标与计数，**没有 `+` 入口**。想往特定列加任务，必须先创建（默认进 BACKLOG）再拖拽过去。

### 3.9 无全局搜索与快捷键

没有 ⌘K 命令面板、没有 `N` 新建、没有 `/` 搜索。规范文档的原则 P2「键盘平行」在实现层未启动。当前唯一的键盘能力是 dnd-kit 自带的卡片方向键拖拽。

---

## 4. 视觉规范问题（评分 4.0）

### 4.1 强调色有 5 个且无层级【严重】

| 颜色 | 用途 | 出处 |
|---|---|---|
| `zinc-900` | 主按钮、激活 pill | `button.tsx:6`、`page.tsx:22` |
| `emerald-600` | AI「确认创建」按钮、成功提示 | `AiBreakdownPanel.tsx:195,214` |
| `blue-500/400/200` | 焦点环、拖拽投放区 | `IssueCard.tsx:51`、`BoardColumn.tsx:38` |
| `amber-600` | 同步中提示 | `IssueCard.tsx:32` |
| `red-600/700/800` | 错误、删除 | `FieldError.tsx:6`、`IssueRow.tsx:149` |

**没有品牌色概念。** 紫色（规范里的 `--brand-500`）从未出现，产品因此没有任何视觉识别度。emerald 被同时用于"AI 确认创建"（主操作）和"操作成功"（状态反馈），语义双重占用。

### 4.2 深色模式在实现层整体失效【严重】

`globals.css:15-20` 通过 `prefers-color-scheme` 切换了 `--background` / `--foreground`，但**组件完全不消费这两个变量**。在系统深色模式下：

| 元素 | 实际表现 |
|---|---|
| 页面底色 | 变黑（`--background: #0a0a0a` 生效） |
| 输入框 | 仍是 `bg-white`（`input.tsx:4` 硬编码）+ `text-zinc-900` → 白底黑字浮在黑色页面上 |
| 边框 | 仍是 `border-zinc-200` → 浅灰边框在暗色底上刺眼 |
| 卡片 | `bg-white`（`IssueCard.tsx:23`）→ 白色方块 |
| 看板列 | `bg-zinc-50`（`BoardColumn.tsx:38`）→ 亮色块 |

全站**没有任何 `dark:` 变体**。这是一个可复现的视觉崩坏，而不是"未优化的边角"。

### 4.3 无层级（elevation）体系

全站唯一阴影是拖拽浮层的 `shadow-lg`（`IssueCard.tsx:24`）。没有为"卡片 / 下拉菜单 / 抽屉 / Toast"预定义层级令牌。深色模式下传统阴影几乎不可见，需要的"边框 + 微投影"双通道方案尚未建立。

### 4.4 动效不统一且不尊重减弱动效偏好

三套动效机制并存：`transition-colors`（多处）、`animate-pulse`（`loading.tsx:8-21`）、dnd-kit 的 inline `transition`（`IssueCard.tsx:48`）。没有统一的时长与缓动令牌，且 `animate-pulse` 未包 `prefers-reduced-motion` 媒体查询。

### 4.5 全站零图标、零品牌资产

`public/` 目录仍是 create-next-app 默认的 5 个 svg。界面里没有任何图标：状态靠色彩徽标文字、操作靠纯文字链接、空状态没有图形引导。对"5 秒内看懂产品"的演示目标不利。

### 4.6 字体声明与规范不一致

- `app/layout.tsx:6-13` 只加载 `subsets: ["latin"]`，中文依赖系统回退（这个取舍本身合理，避免字体体积膨胀）；
- 但 `globals.css:11` 把 `--font-sans` 指向 `var(--font-geist-sans)`，与规范文档定义的「Inter + 系统中文字体栈」不一致；
- 等宽字体的用途（Issue ID、快捷键提示）未被使用，因为界面上还没出现这两类内容。

---

## 5. 响应式布局问题（评分 4.0）

### 5.1 看板 4 列的宽度算错，列被压扁【严重】

`Board.tsx:170`：

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
```

断点 `xl`（≥1280px）**基于视口宽度判断**，但外层容器是 `max-w-5xl`（1024px，`issues/page.tsx:34`）。因此：

```
视口 1440px → 容器仍为 1024px → 4 列 = (1024 - 48 - 3×12) / 4 ≈ 235px
```

每列约 235px，看板卡片的标题会严重折行（规范建议列宽 296px）。而且没有任何横向滚动兜底——列只会越挤越窄，不会退化为可滚动。

### 5.2 骨架屏宽度与真实页面不一致，数据到达时横向跳动【严重】

- `issues/loading.tsx:7` 用 `max-w-3xl`（768px）
- `issues/page.tsx:34` 用 `max-w-5xl`（1024px）

数据加载完成后，整个页面容器从 768px 跳到 1024px。这正好**违背该文件自己声明的目标**：

```tsx
/**
 * 加载态（US-005：加载时不得引起布局跳动）。
 * 骨架的尺寸与真实页面一致，避免数据到达后整页位移。
 */
```

意图正确，实现与意图不符。这正是 US-005「加载态不得引起布局跳动」验收标准的具体违反点。

### 5.3 移动端无任何导航降级

- 没有底部 Tab、没有汉堡菜单；
- 页面结构（视图 pill + 创建表单 + 看板/列表 + AI 面板）在 375px 下全部纵向堆叠，**首屏几乎看不到任何任务**；
- 任务列表的容器 `max-w-5xl` 在窄屏下退化为满宽，但内边距仍是 `px-6`，实际可用宽度更紧张。

### 5.4 触控目标低于标准

| 元素 | 尺寸 | 位置 |
|---|---|---|
| 列表行「编辑 / 删除」文字链接 | `text-xs`，约 16px 高 | `IssueRow.tsx:16` |
| AI 子任务「删除」文字链接 | `text-xs` | `AiBreakdownPanel.tsx:232` |
| 看板列计数 | `text-xs text-zinc-400` | `BoardColumn.tsx:47` |

WCAG 2.1 AA 建议触控目标 ≥44×44px。文本链接形式在触屏上极易误触，且「编辑」与「删除」在垂直方向仅相隔 `gap-4`（16px）。

### 5.5 `touch-none` 让卡片区域无法滚动

`IssueCard.tsx:51` 给可拖拽卡片加了 `touch-none`：

```tsx
className={`cursor-grab touch-none ...`}
```

`touch-none` 作用在**整张卡片**上，意味着在触屏设备上，用户手指落在卡片上时**无法滚动页面**——想上滑看下面的任务，如果手指起于卡片，页面纹丝不动。这是移动端最严重的交互缺陷之一。正确做法是只把 `touch-action` 限制施加在明确的拖拽把手上，或使用 dnd-kit 的 `TouchSensor` + `delay` 激活约束。

### 5.6 断点策略不完整

全站只用了 `sm:`（`Board.tsx:170`、`IssueForm.tsx:59`、`(auth)` 无）与 `xl:` 两个断点。**没有 `md:` / `lg:` 中间态**，1024–1279px 区间的行为与 1280px 以上完全相同（都按 4 列处理，但空间不足）。规范定义的六个断点在实现中只落地了两个。

---

## 6. 无障碍问题（评分 5.0）

### 6.1 错误提示未与输入框建立程序化关联【严重】

`FieldError.tsx:2-10` 渲染 `<p role="alert">` 但**没有 `id`**，消费方（如 `IssueForm.tsx:36`）只设置了 `aria-invalid`，**没有 `aria-describedby`**：

```tsx
<Input id="issue-title" ... aria-invalid={fields?.title ? true : undefined} />
<FieldError message={fields?.title} />   // 无 id，无法被引用
```

后果：屏幕阅读器用户聚焦到出错的输入框时，只被告知"无效"，**听不到具体错在哪里**。修复需要给 `FieldError` 加 `id` 参数，并在输入框上写 `aria-describedby`。

### 6.2 焦点可见性不达标【严重】

- `input.tsx:5` 的 `focus:ring-zinc-200` 对白底约 1.3:1，**低于 WCAG 要求的 3:1**（非文本对比度）；
- `button.tsx` 未定义焦点样式，落到浏览器默认表现，与设计语言脱节；
- 全站 4 种焦点表现并存（见 §2.3），键盘用户无法建立稳定的位置预期。

### 6.3 文字对比度不达标

| 位置 | 类名 | 背景 | 估算对比度 | 判定 |
|---|---|---|---|---|
| `IssueCard.tsx:31` 日期 | `text-[11px] text-zinc-400` | `bg-white` | ≈ 2.6:1 | ✗ 且字号 11px 低于可读下限 |
| `IssueRow.tsx:58` 创建时间 | `text-xs text-zinc-400` | `bg-white` | ≈ 2.6:1 | ✗ |
| `BoardColumn.tsx:47` 计数 | `text-xs text-zinc-400` | `bg-zinc-50` | ≈ 2.5:1 | ✗ |
| `AiBreakdownPanel.tsx:227` 序号 | `text-xs text-zinc-400` | `bg-white` | ≈ 2.6:1 | ✗ |

AA 标准要求正文 ≥4.5:1、大字 ≥3:1。`zinc-400`（`#a1a1aa`）在白底上不满足任何一档。日期与计数虽属次要信息，但仍是用户需要读取的内容。

### 6.4 已具备的无障碍能力（应保留）

- 表单错误用 `role="alert"`、成功用 `role="status"`（`IssueRow.tsx:138`）；
- 看板列有 `aria-label="进行中列，共 5 个任务"`（`BoardColumn.tsx:36`）；
- 骨架屏有 `aria-busy="true"` + `sr-only` 文字（`loading.tsx:7,23`）；
- 卡片有 `aria-label`（`IssueCard.tsx:54`）与 `focus-visible` 处理（`:51`）；
- 键盘拖拽可用（`Board.tsx:50`）。

**结论**：无障碍的"意识到位"了，缺的是执行细节（关联、对比度、统一焦点）与自动化校验。

---

## 7. 工程质量关联（评分 6.0）

### 7.1 架构被 lint 保护，设计系统没有护栏【根本原因】

`eslint.config.mjs:11-85` 用 `no-restricted-imports` 严格约束依赖方向，例如：

```js
{
  group: ["@/components/*", "**/components/*"],
  message: "lib/ 不得依赖 components/：五层架构只允许向下依赖。",
}
```

但**没有任何规则阻止硬编码颜色或新建第二个按钮组件**。这直接解释了为什么 `components/ui/` 的表单抽象很干净，而页面级组件全面漂移：

> 有护栏的地方一致，没护栏的地方漂移。

**这是本次审计最重要的结论。** 修复 UI 一致性最有效的手段不是"下次注意"，而是补上护栏（见 §9.1）。

### 7.2 测试覆盖行为而非视觉

- `tests/unit/` 覆盖 rate-limit / errors / validation / ai / client-ip；
- `scripts/smoke.mjs` 走 HTTP 层端到端；
- **没有任何视觉回归测试或 a11y 断言**（未引入 axe / jest-axe / Playwright 截图对比）。

因此 §5.2 的骨架屏宽度不一致、§4.2 的深色模式失效这类问题，全部无法被现有测试发现。

### 7.3 文档与实现存在双向失配

| 项 | 文档 | 实现 |
|---|---|---|
| 状态标签 | 待办池 / 待处理 / 进行中 / 已完成 | 待整理 / 待开始 / 进行中 / 已完成（`types/issue.ts:12-17`） |
| 删除交互 | 执行 + 5 秒撤销 | 二次确认 |
| 看板列宽 | 296px 固定 | 自适应挤压（~235px） |
| 状态色值 | 令牌（`--status-todo: #5B8DEF`） | Tailwind 类（`bg-blue-50 text-blue-700`） |

失配本身不可怕，可怕的是**没有同步机制**。建议规定：涉及 UI 契约的变更必须同时更新 `ui-design-system-v2.md`，并在 DoD 中加入检查项。

---

## 8. 问题优先级汇总

按「影响面 × 修复成本」排序。P0 应在本 Sprint 内完成，P1 可在下一个 Sprint，P2 纳入 Backlog。

### P0 — 必须修（阻断演示质量或存在明确缺陷）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | 建立语义令牌层 | `app/globals.css` | 所有一致性问题的根因 |
| 2 | 深色模式失效 | 全站组件 | 可复现的视觉崩坏 |
| 3 | 骨架屏宽度不一致导致跳动 | `loading.tsx:7` | 直接违反 US-005 验收标准 |
| 4 | 看板列宽被容器压扁 | `Board.tsx:170` + `issues/page.tsx:34` | 1280px+ 下布局不可用 |
| 5 | `touch-none` 阻断移动端滚动 | `IssueCard.tsx:51` | 移动端最严重交互缺陷 |
| 6 | 焦点样式统一（4 种 → 1 种） | 全站 | 键盘可用性与专业度 |
| 7 | 错误提示与输入框关联 | `FieldError.tsx` + 各表单 | 屏幕阅读器用户无法获知错误 |
| 8 | 文字对比度（`zinc-400` → 达标色） | 4 处 | WCAG AA 不达标 |

### P1 — 应该修（影响体验与说服力）

| # | 问题 | 说明 |
|---|---|---|
| 9 | 建立应用外壳（侧边栏 + 顶栏） | 解决"四个模块挤一页"与 AI 能力被埋没 |
| 10 | 统一按钮为 1 套组件（5 套 → 1 套） | 消除圆角/主色摇摆 |
| 11 | 空状态补主动作 | 列表空状态、看板空列 |
| 12 | 创建成功给反馈 | 与编辑成功对齐 |
| 13 | 提交按钮宽度锁定 | 消除抖动 |
| 14 | 引入 Toast 层统一反馈 | 4 种反馈模式 → 1 种 |
| 15 | AI 拆解加载骨架 + 可取消 | 补 `AbortController` 与骨架屏 |
| 16 | 页面标题尺度统一（3 套 → 1 套） | 排版层级 |
| 17 | 触控目标 ≥44px | 列表行与 AI 面板的操作链接 |
| 18 | 补 `md:` / `lg:` 中间断点 | 1024–1279px 区间行为 |

### P2 — 可以排期（增强项）

| # | 问题 | 说明 |
|---|---|---|
| 19 | 引入 ⌘K 命令面板与键盘快捷键 | 落实原则 P2 |
| 20 | 图标系统 + 品牌资产 | 提升"5 秒看懂"的效率 |
| 21 | 看板列快速新建（`+`） | 减少"先建再拖"的两步操作 |
| 22 | 动效令牌 + `prefers-reduced-motion` | 统一时长与缓动 |
| 23 | 视觉回归与 axe 断言 | 让上述问题不再复现 |
| 24 | 修正失效的文档路径引用 | `(dashboard)/layout.tsx:8`、`eslint.config.mjs:7` |
| 25 | 修正 `types/issue.ts:19` 的错误归因注释 | 股票惯例与任务状态无关 |

---

## 9. 改进建议

### 9.1 补上 UI 一致性护栏（最高优先级）

现状是"架构有护栏、设计没有"。建议在 `eslint.config.mjs` 中新增一条禁止硬编码颜色的规则，例如用 `no-restricted-syntax` 拦截 Tailwind 调色板字面量：

```js
// 示意：禁止在业务组件里直接写调色板类名，必须走语义令牌
{
  files: ["app/**/*.tsx", "components/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "warn",
      {
        selector:
          "Literal[value=/\\b(bg|text|border)-(zinc|slate|gray|blue|emerald|amber|red)-\\d{2,3}\\b/]",
        message: "禁止硬编码调色板：请使用语义令牌类（bg-surface / text-secondary / border-subtle）。",
      },
    ],
  },
}
```

配合 `components/ui/` 之外的目录禁用裸 `<button>` 规则，即可在机制上阻止 §2.2 与 §2.3 的漂移复发。

### 9.2 按依赖顺序推进，不要并行改

推荐顺序（每步都可独立验收）：

1. **令牌层**（`globals.css` + `[data-theme]`）——不依赖任何库，是其余步骤的前提
2. **统一原语**（按钮/输入框/徽标）——优先解决 5 套 → 1 套
3. **反馈层**（Toast + Dialog/Drawer）——统一 4 种反馈模式
4. **应用外壳**（侧边栏 + 顶栏）——解决信息架构
5. **响应式与移动端**——在前四步稳定后处理
6. **护栏与测试**——把已修的规则固化，防止回退

### 9.3 组件库引入是加速器，不是替代品

上述 P0 中的 1、6、7、8 可以用令牌层与手写修复，但 P1 中的 9、14、15、19 需要 Dialog / Drawer / Toast / Command 这类**交互复杂且无障碍要求高**的组件。这些组件的焦点陷阱、键盘导航、ARIA 关联极其容易写错，不建议手写——这正是组件库的价值区间。选型分析见 `docs/02-architecture/adr-006-component-library.md`。

---

## 附录：审计方法

| 手段 | 覆盖范围 |
|---|---|
| 全量源码阅读 | `app/`（15 文件）、`components/`（11 文件）、`hooks/`、`types/issue.ts` |
| 样式漂移统计 | 按「组件类型 × 样式实现」建表，统计并行实现数量 |
| 对比度评估 | 按 WCAG 2.1 相对亮度公式估算关键文字/背景组合 |
| 布局缺陷推演 | 按「断点触发条件 × 容器实际宽度」验算看板列宽与骨架宽度 |
| 规范符合性核对 | 逐条对照 `ui-design-system-v2.md` 的组件规范与验收清单 |
| 护栏有效性检查 | 阅读 `eslint.config.mjs`，判断哪些规则能阻止已发现问题 |

**未覆盖**：真实浏览器渲染截图、屏幕阅读器实测、真机触控验证（三项需在修复后补充验证）。

