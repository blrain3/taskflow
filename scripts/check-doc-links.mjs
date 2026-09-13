#!/usr/bin/env node
/**
 * 文档相对链接校验（对应 docs/README.md「文档质量门禁」第 1 条）。
 *
 * 起因：文档目录重组后，根 README 曾残留 9 条指向旧路径的失效链接，而门禁条款
 * 只写在文档里、没有任何工具执行，于是无人发现。本脚本把该条款变成可执行检查。
 *
 * 检查范围：docs/ 下的 .md 与 .html，以及仓库根的 README.md / AGENTS.md / CLAUDE.md。
 * 检查对象：Markdown 链接 `](path)` 与 HTML 的 href/src 属性。
 * 忽略：http(s)、mailto、data:、纯锚点；以及 .prettierignore / .gitignore 覆盖的路径。
 *
 * 用法：node scripts/check-doc-links.mjs   （失效则退出码 1，可直接进 CI）
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const SCAN_ROOTS = ["docs"];
const SCAN_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"];
const LINK_PATTERNS = [/\]\(\s*([^)\s]+?)\s*\)/g, /(?:href|src)\s*=\s*"([^"]+)"/g];

function collectTargets() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|html)$/i.test(entry.name)) files.push(full);
    }
  };

  for (const dir of SCAN_ROOTS) {
    const full = path.join(root, dir);
    if (fs.existsSync(full)) walk(full);
  }
  for (const file of SCAN_FILES) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

function isExternal(href) {
  return /^(https?:|mailto:|tel:|data:|#)/i.test(href);
}

const files = collectTargets();
const problems = [];
let checked = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const seen = new Set();

  for (const pattern of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1];
      if (!raw || isExternal(raw)) continue;

      const href = raw.split("#")[0];
      if (!href) continue;

      const key = `${path.relative(root, file)}::${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checked += 1;

      let resolved;
      try {
        resolved = path.resolve(dir, decodeURIComponent(href));
      } catch {
        problems.push({ file: path.relative(root, file), href, reason: "路径无法解析" });
        continue;
      }

      if (!fs.existsSync(resolved)) {
        problems.push({ file: path.relative(root, file), href, reason: "目标不存在" });
      }
    }
  }
}

console.log(`[docs:check] 扫描 ${files.length} 个文档，校验 ${checked} 条相对链接`);

if (problems.length === 0) {
  console.log("[docs:check] 全部相对链接有效 ✅");
  process.exit(0);
}

console.error(`[docs:check] 发现 ${problems.length} 条失效链接：`);
for (const problem of problems) {
  console.error(`  ${problem.file}  ->  ${problem.href}  (${problem.reason})`);
}
console.error(
  "\n修复建议：文档移动后同步更新引用；新增文档时确认相对路径层级（docs/<分类>/<文件>）。"
);
process.exit(1);
