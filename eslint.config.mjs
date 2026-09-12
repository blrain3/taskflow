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
            "components/ 不得直接访问数据库：写操作走 actions/，读操作由 app/ 的 Server Component 注入 props。",
        },
      ],
    },
  ],
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
              group: ["@/components/*", "**/components/*", "react", "react-dom"],
              message: "actions/ 不得依赖 UI 层：仅允许编排 lib/ 与 Prisma。",
            },
          ],
        },
      ],
    },
  },
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
