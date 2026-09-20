# TaskFlow 面试证据记录

> 状态：持续填充
> 维护阶段：面试交付
> 关联文档：[文档中心](../README.md)、[开发路线图](../03-development/development-roadmap.md)

本文档用于把项目实现转换为可验证的面试材料。

原则：

- 不只记录“使用了什么技术”。
- 必须记录“解决了什么问题”。
- 每项能力必须关联代码、测试或运行结果。
- AI 生成内容必须经过人工审查和验证。

---

## 1. 项目概览

### 项目名称

TaskFlow

### 项目目标

<!-- 用 2-3 句话说明项目解决的问题 -->
TaskFlow 是一个面向个人用户的轻量级任务协作平台：登录后在工作区中以列表和看板管理任务，核心差异化能力是用自然语言让 AI 把一句话需求拆解为可确认、可批量创建的结构化子任务。项目以「可部署、可测试、可讲解」为工程质量目标，采用国内部署方案（腾讯云 + Docker Compose + HTTPS）。

### 个人职责

<!-- 说明你独立负责的范围 -->
独立负责全部工作：需求范围定义（`../01-product/mvp-scope.md`）、架构与技术决策（ADR）、前后端实现、测试与部署、文档维护。

### 技术栈

- Next.js：16.x（App Router，根目录 `app/`）
- React：19.x（RSC + Client Component）
- TypeScript：strict 模式
- PostgreSQL / Prisma：六表模型 + 数据库枚举 + 迁移
- Auth.js：Credentials Provider + JWT 会话
- Vercel AI SDK：OpenAI-compatible，默认 DeepSeek，`AI_PROVIDER=mock` 可测
- Jest / RTL：Jest 已接入（单元测试）；RTL 待接入
- Playwright：已接入（E2E 基础用例）
- CI/CD：GitHub Actions（lint → format → prisma → build → test）
- 国内云平台：腾讯云 Lighthouse / ECS
- 容器化：Docker、Docker Compose
- Web 服务：Nginx、HTTPS

### 演示链接

- 预览环境：
- 国内部署地址：
- 演示视频：
- Git 仓库：

---

## 2. 能力证据总表

下表「实现位置」列已按当前代码填入事实锚点；「解决的问题」「验证方式」「面试结论」三列在逐章整理证据时补全。行号会随代码演进漂移，讲述前以文件为锚复核。

| 能力 | 实现位置 | 解决的问题 | 验证方式 | 面试结论 |
|---|---|---|---|---|
| JavaScript / ES6+ | `lib/issues.ts`（Set 去重、恒等式推导）、`lib/rate-limit.ts`（Map 滑动窗口）、`types/action.ts`（可辨识联合 `ActionResult`） | 待填 | `tests/unit/` 11 套件 | 待填 |
| DOM / 事件 | `components/board/Board.tsx`、`hooks/useBoardMove.ts`（@dnd-kit PointerSensor/KeyboardSensor、乐观更新与快照回滚） | 待填 | 待 Playwright 拖拽用例 | 待填 |
| 异步编程 | `lib/ai.ts`（AbortController 超时、瞬时故障重试、限流）、`hooks/useBoardMove.ts`（竞态：在途禁拖、失败回滚） | 待填 | 冒烟覆盖超时 504 / 限流 429 / 无效输出 502 | 待填 |
| React 原理 | `app/(dashboard)/issues/page.tsx`（RSC 直读）、`components/issue/IssueRow.tsx`（`<details>` 渐进增强）、`hooks/useBoardMove.ts`（渲染期对齐 props 的同步暂停） | 待填 | 冒烟 SSR 断言 | 待填 |
| Vue 原理 | 未实现（P1/P2，范围见 `../01-product/mvp-scope.md` §3） | — | — | 以文档对比替代或延后 |
| 后端能力 | `actions/auth.ts`、`actions/issue.ts`（四步契约）、`lib/permissions.ts`（跨 Workspace 隔离）、`lib/auth-rate-limit.ts`（authorize 统一限流，覆盖 REST 回调）、`lib/issue-batch.ts`（幂等批量创建） | 待填 | 冒烟 40 项 + Jest | 待填 |
| AI Coding | `docs/superpowers/plans/`（计划文件）、各批次提交历史 | 待填 | 人工审查 + 测试通过 | 待填 |

---

## 3. JavaScript / ES6+ 证据

### 场景

<!-- 例如：将 API 返回数据转换为看板分组 -->

### 使用的语言特性

- 解构
- 展开运算符
- 模块化
- Promise / async / await
- Map / Set
- 可选链和空值合并
- 泛型或类型守卫

### 代码位置

- 文件：
- 行号：
- Commit：

### 设计说明

<!-- 为什么使用这些特性，而不是更简单或更旧的写法 -->

### 测试证据

- 测试文件：
- 覆盖场景：
- 测试结果：

---

## 4. DOM 与事件机制证据

### 场景

<!-- 例如：看板拖拽、键盘快捷键或事件委托 -->

### 需要解释的知识点

- 事件冒泡和捕获
- `preventDefault`
- 事件委托
- Pointer / Mouse / Keyboard 事件差异
- 第三方拖拽库与原生事件的关系

### 代码位置

- 文件：
- 行号：

### 行为证据

- 正常拖拽：
- 无效拖拽：
- 请求失败回滚：
- 键盘操作：

### 测试证据

- 测试文件：
- 测试结果：

---

## 5. 异步编程证据

### 场景

<!-- 例如：AI 请求、乐观更新或批量创建 -->

### 处理策略

- 加载状态：
- 超时：
- 重试：
- 请求取消：
- 重复提交防护：
- 竞态处理：
- 错误传播：

### 代码位置

- 文件：
- 行号：

### 测试证据

- 成功请求：
- 超时：
- 服务端错误：
- 重复点击：
- 回滚：

---

## 6. React 原理证据

### 主题

- Server Component 与 Client Component 边界
- Server Action 调用流程
- React 状态更新和重新渲染
- `memo` 的使用条件
- Key 对列表渲染的影响
- 乐观更新与 UI 一致性

### 代码位置

- 文件：
- 行号：

### 性能或行为对比

| 方案 | 结果 |
|---|---|
| 优化前 | <!-- 渲染次数、耗时或行为 --> |
| 优化后 | <!-- 渲染次数、耗时或行为 --> |
| 结论 | <!-- 是否值得引入优化 --> |

### 面试讲解

<!-- 用 3-5 句话总结自己的理解 -->

---

## 7. Vue 原理对比证据

### 对比模块

<!-- 如果实现了 Vue 对比页面，填写入口和范围 -->

### 对比维度

| 维度 | React | Vue |
|---|---|---|
| 响应式模型 | <!-- --> | <!-- --> |
| 状态更新 | <!-- --> | <!-- --> |
| 组件通信 | <!-- --> | <!-- --> |
| 生命周期 | <!-- --> | <!-- --> |
| 列表渲染 | <!-- --> | <!-- --> |
| 性能优化 | <!-- --> | <!-- --> |

### 代码位置

- React 实现：
- Vue 实现：
- 对比文档：

### 面试结论

<!-- 说明两者的核心差异，以及为什么当前项目选择 React -->

---

## 8. 后端能力证据

### 服务端功能

- Session 校验：
- Workspace 权限校验：
- 输入校验：
- 数据库读写：
- AI API 封装：
- 错误处理：
- 限流或请求限制：

### 代码位置

- Server Actions：
- API Routes：
- Prisma Schema：
- 校验 Schema：
- 错误处理：

### 测试证据

- 未登录访问：
- 跨 Workspace 访问：
- 非法输入：
- 数据库失败：
- AI 输出失败：

---

## 9. 国内部署证据

### 部署环境

- 云平台：
- 地域：
- 操作系统：
- 服务器规格：
- 域名和 HTTPS：
- ICP 备案状态（如适用）：

### 容器化

- Dockerfile：
- Docker Compose：
- 应用容器：
- PostgreSQL 容器或云数据库：

### 反向代理和发布

- Nginx 配置位置：
- HTTPS 配置方式：
- 发布命令：
- 回滚方式：
- 数据库迁移命令：
- 备份和恢复方式：

### 验证证据

- HTTPS 访问截图或链接：
- 应用重启后数据保持：
- 数据库迁移结果：
- CI/CD 日志：
- 服务器日志：

---

## 10. AI Coding 使用记录

每次重要 AI 辅助开发都按以下格式记录。

### 记录模板

#### 日期

<!-- YYYY-MM-DD -->

#### 使用工具

<!-- Cursor / Claude / 其他 -->

#### 任务

<!-- 让 AI 协助完成什么 -->

#### 输入 Prompt

```text
<!-- 记录关键 Prompt，不要包含密钥或隐私数据 -->
```

