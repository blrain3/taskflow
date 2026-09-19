import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * 分层依赖护栏（依据 docs/02-architecture/architecture.md §4「依赖方向铁律」）：
 *   app/ → components/ → actions/ → lib/ → PostgreSQL，只允许向下依赖。
 * 这里把两条最关键的反向依赖变成 lint 错误，避免靠自觉。
 */
const layeringRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@/components/*", "**/components/*"],
          message: "lib/ 不得依赖 components/：五层架构只允许向下依赖。",
        },
        {
          group: ["@/actions/*", "**/actions/*"],
          message:
            "lib/ 不得依赖 actions/：领域层不知道调用方是谁；需要复用 Action 逻辑时把公共部分下沉回 lib/。",
        },
        {
          group: ["@/app/*", "**/app/*"],
          message: "lib/ 不得依赖 app/：路由层是最上层，依赖只能向下。",
        },
        {
          group: ["react-dom", "@/hooks/*"],
          message: "lib/ 不得依赖 UI 运行时或 hooks：领域层只输出纯数据或抛领域错误。",
        },
        {
          // 例外：允许从 react 引入服务端原语 cache()（用于按请求去重）。
          // 但不得在 lib/ 里写 JSX 或使用 hooks——那属于 components/ 的职责。
          group: ["react"],
          importNames: [
            "useState",
            "useEffect",
            "useRef",
            "useReducer",
            "useMemo",
            "useCallback",
            "createContext",
          ],
          message: "lib/ 不得使用 React hooks：只允许引入 cache 等服务端原语。",
        },
      ],
    },
  ],
};

const componentRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@/lib/prisma", "**/lib/prisma"],
          message:
            "components/ 与 hooks/ 不得直接访问数据库：写操作走 actions/，读操作由 app/ 的 Server Component 注入 props。",
        },
        {
          group: ["@/app/*", "**/app/*"],
          message: "components/ 与 hooks/ 不得依赖路由层：依赖只能向下（架构评审 P1-5）。",
        },
      ],
    },
  ],
};

/**
 * UI 护栏：禁止硬编码 Tailwind 调色板类名（ADR-006 / ui-quality-audit.md 的 P0 结论）。
 *
 * 背景：架构依赖被 no-restricted-imports 严格保护，UI 一致性却零约束——审计发现
 * 「有护栏处一致，无护栏处漂移」（按钮 5 套、焦点样式 4 种）。颜色漂移的源头就是
 * 调色板类名（bg-zinc-800 之类）绕过语义令牌直写取值，深浅主题一切换即失效。
 *
 * 检查对象是**所有字符串字面量与模板字符串静态段**，而不只是 className 属性：
 * 类名常被抽成常量或工具函数（如 issues/page.tsx 的 pill()），不经过 JSXAttribute；
 * 只查 className 会漏掉这一大类。业务代码里含调色板类名形态的非样式字符串几乎不存在，
 * 即便误中（如注释外的字符串）也属于该改的写法。
 *
 * 范围不含 tests/ 与 scripts/：它们不产出样式；测试断言文本里引用类名是合法的回归断言。
 * 令牌类名（bg-surface / text-fg-muted / border-line / bg-brand / bg-status-* 等）
 * 与语义色（danger/success/warning/info）不含调色板词，天然不受影响；
 * 调色板的具体取值只允许出现在令牌定义层（app/globals.css 的 @theme 段）。
 */
const PALETTE_CLASS_RE = new RegExp(
  [
    // 形态一：前缀-调色板色-明度数字，含任意变体与透明度后缀（hover:bg-blue-500/50）
    "\\b(?:bg|text|border|divide|ring|outline|decoration|shadow|accent|caret|fill|stroke|placeholder|from|via|to)" +
      "-(?:zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)" +
      "-\\d{2,3}\\b",
    // 形态二：white/black 无明度档位，单独拦截（text-fg-inverse 才是令牌写法）
    "\\b(?:bg|text|border|divide|ring|outline|decoration|shadow|accent|caret|fill|stroke|placeholder|from|via|to)-(?:white|black)\\b",
  ].join("|")
);

const uiGuardPlugin = {
  rules: {
    "no-palette-classes": {
      meta: {
        type: "problem",
        docs: {
          description:
            "禁止硬编码 Tailwind 调色板类名：颜色必须走语义令牌（ui-design-system-v2.md）",
        },
        schema: [],
        messages: {
          paletteClass:
            "硬编码调色板类「{{name}}」：请改用语义令牌（bg-surface / text-fg-muted / border-line / bg-brand / bg-status-* 等，见 docs/05-design-assets/ui-design-system-v2.md）。调色板取值只允许写在令牌定义层 app/globals.css 的 @theme 段。",
        },
      },
      create(context) {
        function report(node, raw) {
          // 列出字符串里**全部**命中类名而不是只报第一个：一条 className 常混入多个违规写法
          const globalRe = new RegExp(PALETTE_CLASS_RE.source, "g");
          const hits = [...raw.matchAll(globalRe)].map((m) => m[0]);
          if (hits.length > 0) {
            context.report({
              node,
              messageId: "paletteClass",
              data: { name: hits.join(", ") },
            });
          }
        }
        return {
          Literal(node) {
            if (typeof node.value === "string") report(node, node.raw);
          },
          TemplateElement(node) {
            report(node, node.value.raw);
          },
        };
      },
    },
  },
};

const uiGuardRules = {
  files: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "lib/**/*.ts",
    "actions/**/*.ts",
    "types/**/*.ts",
  ],
  plugins: { "taskflow-ui": uiGuardPlugin },
  rules: {
    "taskflow-ui/no-palette-classes": "error",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["lib/**/*.ts"],
    rules: layeringRules,
  },
  {
    files: ["components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: componentRules,
  },
  {
    files: ["actions/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/*",
                "**/components/*",
                "@/app/*",
                "**/app/*",
                "@/hooks/*",
                "**/hooks/*",
                "react",
                "react-dom",
              ],
              message:
                "actions/ 不得依赖 UI 层、路由层与客户端状态逻辑：仅允许编排 lib/ 与 Prisma。",
            },
          ],
        },
      ],
    },
  },
  uiGuardRules,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
