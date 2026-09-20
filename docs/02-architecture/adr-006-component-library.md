# ADR-006：UI 组件库选型

> 状态：已接受，基础组件已迁移
> 版本：v1.1
> 最后更新：2026-09-13

## 当前实施清单

- [x] components.json、令牌层与 [data-theme]
- [x] Button、Input、Textarea、Dialog、Badge、Label、Skeleton、FieldError
- [ ] Drawer、Toast / Sonner
- [ ] Select、Dropdown、Tooltip、Popover、Tabs
- [ ] RTL 与视觉回归测试


- 状态：已接受
- 日期：2026-09-11
- 决策人：个人开发者
- 适用范围：TaskFlow MVP 及其后续版本
- 关联文档：`docs/02-architecture/adr-001-technical-decisions.md` §2、`docs/05-design-assets/ui-design-system-v2.md`、`docs/05-design-assets/ui-quality-audit.md`

---

## 1. 背景

ADR-001 §2 对样式层的表述是「Tailwind CSS；仅在确有需要时引入 Shadcn/ui」——把是否引入组件库留成了待定的开放项。

当前 `docs/05-design-assets/ui-quality-audit.md` 的审计结论表明，**这个开放项现在需要关闭了**。审计发现的问题里，有一部分手写成本很高而组件库恰好覆盖：

| 审计项 | 问题 | 为何不适合长期手写 |
|---|---|---|
| P1-9 | 应用外壳缺失（侧边栏 + 顶栏 + 移动端抽屉） | 移动端抽屉需要焦点陷阱、滚动锁定、`Esc` 关闭、`aria-modal` |
| P1-14 | 反馈模式 4 种，需统一 Toast 层 | Toast 需要队列管理、计时器、层叠定位、`aria-live` 播报 |
| P1-15 | AI 拆解需要 Dialog / 结果面板 | 模态焦点管理是公认的高错误率区域 |
| P2-19 | ⌘K 命令面板 | 需要虚拟列表、组合框键盘导航、模糊匹配 |

这些组件的共同点是：**行为逻辑（键盘导航、焦点管理、ARIA 关联）远比外观复杂，而外观恰恰是本项目唯一需要自定义的部分。** 引用的搜索结论明确指出：*"Building accessible Dialogs, Comboboxes, and Menus from scratch is extremely error-prone. These libraries encode hundreds of hours of accessibility expertise."*

同时有两条硬约束必须满足：

1. **视觉必须完全由项目掌控。** 已有 `ui-design-system-v2.md` 定稿的 Linear 风格与三层令牌体系，不能被组件库的默认设计语言覆盖。
2. **不能推翻已有的架构与实现。** `components/ui/` 已有可用原语，表单三件套（`FieldError` / `FormError` / `SubmitButton`）已被三处复用，看板与乐观更新逻辑与 UI 库无关。

因此本 ADR 要回答的不是"要不要用组件库"，而是**"用哪一层、哪一个、以什么形式引入"**。

---

## 2. 候选方案分层

候选库并非处于同一抽象层。混淆层次是选型最常见的错误——例如把 shadcn/ui 与 Mantine 并列比较，前者是"复制进仓库的源码"，后者是"整个设计语言"。先分层：

| 层次 | 含义 | 候选 |
|---|---|---|
| **原语层**（headless） | 只提供行为与无障碍，零样式 | Base UI、Radix Primitives、React Aria、Headless UI、Ark UI |
| **组件层**（copy-in 源码） | 原语 + Tailwind 样式，源码复制进仓库，可任意修改 | **shadcn/ui** |
| **组件层**（组件库） | 原语 + 默认样式，作为 npm 依赖升级 | Headless UI、React Aria Components |
| **设计系统层**（opinionated） | 自带完整设计语言与主题系统 | Mantine、Chakra UI、Ant Design、HeroUI |
| **CSS 类层** | 纯 Tailwind 插件，提供语义类名 | daisyUI |

本项目需要的是**原语层 + 一个能快速产出符合自定义令牌的组件层**。

---

## 3. 候选评估

### 3.1 shadcn/ui

| 维度 | 情况 |
|---|---|
| 形态 | CLI 把组件源码复制进 `components/ui/`，**不是 npm 运行时依赖** |
| Tailwind v4 | 完整支持；官方已迁移到 `@theme inline` + CSS 变量，与 v2 令牌体系同构 |
| React 19 | 完整支持；已移除 `forwardRef`，改用 React 19 的 ref 属性，每个原语带 `data-slot` 便于样式定位 |
| 原语选择 | 支持通过 `--base` 标志在 **Radix 与 Base UI 之间切换**原语层 |
| 主题机制 | 以 CSS 变量暴露，运行时切换暗色模式无需重新构建 |
| 组件覆盖 | 40+ 组件，含本项目缺的 Dialog / Drawer / Toast / Command / Tooltip / Select / Form |
| 文档 | 有官方中文站（shadcn.com.cn），对中文项目友好 |
| 生态 | 已积累约 7.5 万 GitHub Star，是当前新 React 项目的默认起点；第三方 blocks 生态（Origin UI、Kibo UI 等）丰富 |

**优点**

- **零运行时依赖、零版本冲突**：源码进仓库后就是自己的代码，升级与否完全自主。
- **与现有实现路径一致**：本项目已经在用"手写 `components/ui/` 原语"的模式，shadcn 只是把这个模式做到生产级完备，不需要改变架构心智。
- **主题层与本项目令牌体系天然契合**：shadcn 用 CSS 变量 + `@theme inline`，`ui-design-system-v2.md` §10.2 的落地代码也正是这个写法，替换变量即可套用自有色板。
- **分层架构不受影响**：组件落在 `components/ui/`，`eslint.config.mjs` 的依赖方向规则无需修改。

**缺点与风险**

- 默认色板是 zinc/neutral 系，**必须替换为项目令牌**，否则会引入第二套颜色语义（这一替换工作量不大，但必须做）。
- 需要引入 `clsx` + `tailwind-merge` 作为 `cn` 工具（两个极小的纯 JS 包）。
- 复制式意味着代码体积进入仓库、需要自行跟进上游修复。
- 官方已弃用自带 `toast` 组件，改用 `sonner`；本项目应直接采用 sonner。

### 3.2 Base UI

| 维度 | 情况 |
|---|---|
| 定位 | 无样式原语层，由 MUI 团队维护，作者包含 Radix 与 Floating UI 的核心成员 |
| 版本 | v1.0.0 稳定发布于 2025-12-11；当前 v1.7.0（2026-08-04），已进入正常语义化版本节奏（`^1`） |
| 包名 | `@base-ui/react`（旧的 `@base-ui-components/react` 已废弃，停留在 rc 版本，**不可用**） |
| 规模 | 35 个无障碍组件，MIT |
| React 19 | 原生支持；Server Components 感知、refs as props |
| 复杂组件 | Combobox、多选等复杂交互的 API 比 Radix 更干净 |

**优点**

- 维护活跃度**明显高于 Radix**（Radix 被 WorkOS 收购后部分复杂组件更新放缓，Combobox 与多选是被点名的弱项）。
- 由 MUI 这样有专职团队的公司背书，长期维护承诺更可信。
- API 与 Radix 高度相似，**迁移成本低**——这也是它自称"Radix 继任者"的原因。
- 有 Radix 没有的能力，例如 detached triggers（同一个浮层可被多个触发器复用）。

**缺点与风险**

- 生态成熟度与文档丰富度不及 Radix：绝大多数教程、StackOverflow 答案、第三方 blocks 都是基于 Radix 的。
- 组件数量（35）少于 React Aria（40+ 模式），且部分组件仍在补全中。
- 与 shadcn 的组合更新，属于"次新路径"，踩坑时社区答案更少。

### 3.3 Radix Primitives

| 维度 | 情况 |
|---|---|
| 定位 | 原语层的事实标准，30+ 组件 |
| 采用度 | 极高（`@radix-ui/react-slot` 单独一个包在 2026 年中约 1.31 亿周下载） |
| 风险 | 被 WorkOS 收购后**更新速度放缓**，复杂组件（Combobox、多选）尤其明显 |

**结论**：作为 shadcn 的默认原语层引入成本最低、文档最全，是本项目的**务实默认值**；但需知其停更风险，并在遇到具体组件卡点时准备切到 Base UI。

### 3.4 React Aria Components（Adobe）

- **无障碍最强**，40+ 组件模式，唯一提供完整国际化（RTL、本地化日期/数字）的方案。
- 缺点：hooks 优先的 API 更冗长，每个组件需自行组装；社区体量小于 Radix，**没有 shadcn 这样的上层生态**。
- **判定：不推荐本项目。** 该方案适用于"WAI-ARIA 合规是合同要求"或有多语言需求的产品。TaskFlow 是单人中文项目，采用它会在每个组件上付出额外代码量，收益不匹配。

### 3.5 Headless UI（Tailwind Labs）

- 仅约 10 个组件，**缺少 Tooltip、Toast、Slider、Combobox-with-virtualization**，缺少的恰是本项目需要的。
- API 最易上手，与 Tailwind 亲和度最高，但没有 hooks API，灵活性受限。
- **判定：不推荐。** 组件覆盖不足，引入后仍需另找方案补齐缺口，反而增加技术栈碎片化。

### 3.6 Mantine / Chakra UI / Ant Design / HeroUI

- 属于**设计系统层**，自带完整设计语言、主题系统与样式实现（CSS-in-JS 或独立 CSS）。
- **判定：不推荐，且应明确排除。** 理由不是质量问题（它们各自都很成熟），而是**方向冲突**：
  - 会覆盖 `ui-design-system-v2.md` 已定稿的 Linear 风格与三层令牌体系（规范的核心价值就此作废）；
  - 引入第二套样式运行时（emotion / 独立 CSS），与 Tailwind v4 的构建链路并存，增加体积与不确定性；
  - Ant Design 在 React 19 下还需要兼容补丁包；
  - 一个已经证明能用 Tailwind 手写出可用界面的项目，缺的是"复杂交互原语"，不是"整套视觉"。

### 3.7 daisyUI

- Tailwind v4 插件，提供语义类名（`btn`、`card`、`modal`）。
- **判定：不推荐。** 它是"CSS 类层"方案，与 shadcn 的"复制源码"模型互斥——同时引入会得到两套并行的语义类名体系。且它的默认类名会与项目自己的令牌命名产生概念冲突。

### 3.8 Ark UI

- 跨框架原语层（React / Vue / Solid），基于 Zag.js 状态机。
- **判定：不推荐。** 本项目明确不做 Vue 对比模块的原语复用，跨框架能力用不上，反而引入额外抽象。

---

## 4. 决策

### 4.1 主决策

**采用 shadcn/ui 作为组件层，原语层使用 Radix Primitives（shadcn 默认路径）。**

理由归纳为三条：

1. **形式匹配**：复制式模型与本项目已有的"自持 `components/ui/`"模式同构，不改变架构心智，不引入运行时依赖与版本冲突。
2. **技术栈匹配**：完整支持 Tailwind v4 与 React 19，主题机制（CSS 变量 + `@theme inline`）与 `ui-design-system-v2.md` §10.2 的令牌落地方案完全一致，替换变量即可套用自有色板。
3. **生态匹配**：文档最全、第三方 blocks 最丰富、遇到问题时的社区答案最多——对单人项目而言，这是比"理论最优"更重要的属性。

### 4.2 补充决策：原语层的切换条件

**默认用 Radix；当遇到以下任一情况时，切换到 Base UI**：

- 需要 Combobox / 多选 / Autocomplete 等 Radix 已知更新放缓的组件；
- 需要 detached triggers 等 Base UI 独有能力；
- Radix 目标组件超过一个发布周期无更新。

切换方式是 shadcn 的 `--base` 标志，**不需要更换组件层实现**，这是选择 shadcn 而非直接锁定某个原语库的关键收益。

### 4.3 明确排除

排除 Mantine、Chakra UI、Ant Design、HeroUI、daisyUI——因自带设计语言会覆盖项目已定稿的视觉规范，并引入第二套样式运行时。

React Aria、Headless UI、Ark UI 不予采用，理由见 §3。

---

## 5. 引入范围

只引入**当前确实缺失**的组件，不执行 `add --all`（避免引入大量未使用的代码）。

| 优先级 | 组件 | 对应的审计缺口 |
|---|---|---|
| P0 | `button`、`input`、`textarea`、`badge`、`skeleton`、`separator` | 统一 5 套按钮 / 3 套焦点样式；骨架屏 |
| P0 | `dialog`、`drawer`（vaul）、`sonner`（Toast） | 统一 4 种反馈模式；补模态焦点管理 |
| P0 | `label`、`form`（配合 react-hook-form + zod resolver） | 错误提示与输入框的程序化关联（§6.1） |
| P1 | `select`、`dropdown-menu`、`tooltip`、`popover`、`tabs`、`card`、`avatar` | 应用外壳与列头菜单 |
| P2 | `command`（cmdk） | ⌘K 命令面板 |
| P2 | `table`、`scroll-area` | 高密度列表视图 |

**不引入**：`chart`、`carousel`、`calendar`、`date-picker` 等本项目用不到的组件。

---

## 6. 实施步骤

### 6.1 前置顺序（关键）

**令牌层必须先于组件库落地。** 若先引入 shadcn 再改令牌，会经历一次覆盖全站的颜色重写；反过来则只需在引入时替换一次变量。

1. **先做令牌层**：改造 `app/globals.css`，落地 `ui-design-system-v2.md` §10.2 的语义令牌，并把主题机制从 `prefers-color-scheme` 改为 `[data-theme]` 属性驱动。此步不依赖任何库。
2. **再初始化 shadcn**，把它的默认色板变量直接指向项目令牌。
3. **逐组件替换**，按 §5 的优先级推进。

### 6.2 初始化命令

> **历史注记（2026-09-12）**：决策时本机 `npm` / `npx` 受安全策略拦截（拉起 `wsl.exe` 被黑名单阻断），安装命令需开发者手动执行。**迁移现已分批执行完成**（令牌层与基础/业务组件迁移，见提交历史「迁移基础组件与任务交互」等）；若未来自动化流程需要再装依赖，先确认该拦截是否仍然生效。React 19 下 npm 可能需要 `--force` 或 `--legacy-peer-deps` 解决 peer 依赖校验。

```bash
npx shadcn@latest init
npx shadcn@latest add button input textarea label badge skeleton separator
npx shadcn@latest add dialog drawer sonner
npx shadcn@latest add form select dropdown-menu tooltip popover tabs card avatar
```

### 6.3 迁移映射

| 现有实现 | 迁移目标 | 说明 |
|---|---|---|
| `components/ui/button.tsx` | shadcn `button` | 把 `variant` 映射到 v2 令牌：`primary → bg-brand`、`secondary → bg-raised + border-default`、`ghost`、`danger`。补齐项目规范要求的 `lg` 尺寸 |
| `components/ui/input.tsx` | shadcn `input` | 移除组件内的 `mt-1`（布局职责泄漏），焦点样式统一为 `focus-visible:ring-focus` |
| `components/ui/field-error.tsx` | shadcn `form` + `FormMessage` | **必须解决 `aria-describedby` 关联**（审计 §6.1），加 `id` 并与输入框串联 |
| `components/ui/submit-button.tsx` | 保留 | 逻辑（`useFormStatus` 防重复提交）正确，只需换用新按钮并锁定 pending 宽度 |
| `app/page.tsx`、`issues/page.tsx` 的 pill | shadcn `button` + `Link` | 消除第 2、3 套按钮实现 |
| `AiBreakdownPanel.tsx` 内联按钮/输入框 | shadcn `button` / `input` / `textarea` | 消除第 3 套焦点样式与 `emerald` 误用 |
| `Board.tsx` 错误横幅 | `sonner` Toast 或 shadcn `alert` | 统一反馈层 |
| `types/issue.ts` 的 `ISSUE_STATUS_STYLES` | 保留结构，值改为令牌引用 | 单一真源的设计正确，只换值 |
| `<details>/<summary>` 行内编辑 | **保留** | 渐进增强设计是有意权衡（审计 G2），shadcn 的 Dialog 无法替代其"无 JS 可用 + SSR 可测"特性 |

### 6.4 护栏配套（与审计 §9.1 联动）

引入组件库后必须同时补上 lint 规则，否则漂移会以新形式复发：

```js
// 禁止在 components/ui/ 之外硬编码调色板类名
"no-restricted-syntax": [
  "warn",
  {
    selector: "Literal[value=/\\b(bg|text|border)-(zinc|slate|gray|blue|emerald|amber|red)-\\d{2,3}\\b/]",
    message: "禁止硬编码调色板：请使用语义令牌类（bg-surface / text-secondary / border-subtle）。",
  },
]
```

---

## 7. 后果

### 正面

- 补齐 Dialog / Drawer / Toast / Tooltip / Command，**模态焦点管理、键盘导航、ARIA 关联由经过验证的实现承担**，不再手写高风险逻辑。
- 按钮从 5 套收敛为 1 套，焦点样式从 4 种收敛为 1 种，容器宽度收敛为统一约定。
- 主题机制与令牌体系一次对齐，深色模式可从"完全失效"变为"变量替换即生效"。
- 组件落在 `components/ui/`，与五层架构和 ESLint 护栏天然兼容，**不需要修改任何架构规则**。

### 负面 / 代价

- 需要开发者手动执行安装命令（本机 npm 受限）。
- 默认色板必须替换，否则引入第二套颜色语义——这一步不能省。
- 源码进仓库，后续跟进上游修复需要自行判断。
- 需要学习 shadcn 的 `data-slot` 与 `cn` 组合约定。
- Radix 原语存在更新放缓风险，已在 §4.2 给出切换条件与路径。

### 需要同步更新的文档

| 文档 | 更新内容 |
|---|---|
| `docs/02-architecture/adr-001-technical-decisions.md` §2 | 样式行的表述由「仅在确有需要时引入 Shadcn/ui」改为确定结论 |
| `docs/02-architecture/adr-index.md` | 登记 ADR-006 |
| `docs/05-design-assets/ui-design-system-v2.md` §10 | 补充组件库落地映射（本文 §6.3） |
| `docs/03-development/definition-of-done.md` | 增加"UI 契约变更需同步设计规范"检查项 |

---

## 8. 验收标准

本 ADR 被接受并实施后，应满足（进度核对日期：2026-09-12）：

- [x] `app/globals.css` 含完整的语义令牌层，且主题由 `[data-theme]` 驱动
- [x] 全站按钮只来自一个组件，圆角与主色不再摇摆
- [x] 全站焦点样式统一，对比度 ≥3:1
- [x] 表单错误通过 `aria-describedby` 与输入框程序化关联
- [ ] 反馈统一走 Toast 层，不再有页内临时横幅（看板错误条与 AI 面板提示仍为页内形式）
- [ ] 业务代码中不存在硬编码的调色板类名（由 lint 规则保证）——现状字面量已清零，但 §6.4 的 lint 护栏规则尚未落入 `eslint.config.mjs`
- [x] 深色模式下无白底输入框等崩坏表现

---

## 9. 参考来源

| 主题 | 来源 |
|---|---|
| shadcn/ui 对 Tailwind v4 与 React 19 的完整支持、`@theme inline` 迁移、原语可切换 | ui.shadcn.com/docs/tailwind-v4、ui.shadcn.com/docs/react-19 |
| React 19 下 npm 的 peer 依赖冲突与 `--force` / `--legacy-peer-deps` 处理 | ui.shadcn.com/docs/react-19 |
| Base UI v1.0（2025-12-11）与包名变更、当前 v1.7.0（2026-08-04）、35 组件 | base-ui.com 发布说明、InfoQ 报道 |
| Radix 被 WorkOS 收购后更新放缓，Combobox 与多选为弱项 | greatfrontend.com/blog、pkgpulse.com |
| 各 headless 库的组件覆盖、包体积、适用场景对比 | trybuildpilot.com、aidxn.com、pkgpulse.com |
| 手写 Dialog / Combobox / Menu 的高错误率与无障碍风险 | letsbuildsolutions.com |


