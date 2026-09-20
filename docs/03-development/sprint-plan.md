# TaskFlow Solo Agile Sprint 计划

> 状态：生效
> 维护阶段：MVP / 部署
> 关联文档：[文档中心](../README.md)、[开发路线图](development-roadmap.md)、[Definition of Done](definition-of-done.md)

## 1. 计划假设

- 周期：4-5 周
- 每周投入：30-40 小时
- 每个 Sprint：约 5-7 个工作日
- 时间分配：70% 功能开发、15% 测试和修复、10% 文档和演示、5% 风险缓冲
- 每个 Sprint 结束必须部署预览版本。
- Sprint 中不加入新功能，只处理缺陷和必要技术任务。

## 2. Solo Agile 节奏

### Sprint 开始

- 明确 Sprint Goal。
- 从 Backlog 选择不超过 3-5 个 Story。
- 为每个 Story 写验收标准。
- 标记技术风险和依赖。

### Sprint 进行中

每日进行一次 10 分钟自检：

- 昨天完成了什么？
- 今天完成什么？
- 当前阻塞是什么？
- 是否需要降级范围？

### Sprint 结束

- 按 Acceptance Criteria 验收。
- 运行 Definition of Done 检查。
- 部署预览环境。
- 记录缺陷和技术债。
- 完成 Retrospective。

## Sprint 0：基线与技术收敛

### 时间

2-3 天，约 12-18 小时。

### Sprint Goal

确定技术边界，建立可运行、可验证的工程基础。

### 入口条件

- 已确认 MVP 范围。
- 已确认使用当前 Next.js 16.x。
- 已确认认证、数据库、AI 和部署方案。

### Story 清单

- 初始化 TypeScript strict。
- 配置 ESLint 和 Prettier。
- 配置 GitHub Actions 的 lint 和 build。
- 安装 Prisma 并建立初始 Schema。
- 配置 PostgreSQL 环境变量。
- 配置 Auth.js。
- 创建 Dockerfile 和 Docker Compose，使用本地 PostgreSQL。
- 明确腾讯云 Lighthouse/ECS、Nginx 和 HTTPS 部署方案。
- 建立 `app/`、`components/`、`actions/`、`lib/`、`types/` 目录边界。
- 创建 README、MVP 文档和 ADR。

### 出口条件

- `npm run lint` 通过。
- `npm run build` 通过。
- Prisma migration 可执行。
- 未配置环境变量时有明确错误提示。
- CI 能自动执行 lint 和 build。
- 预览环境能显示健康检查页面。
- `docker compose up -d` 可以启动本地应用和 PostgreSQL。
- 数据库迁移可在容器环境中执行。

### 可交付增量

一个可部署的工程骨架和完整技术决策记录。

## Sprint 1：认证与 Issue 垂直切片

### 时间

5-6 天，约 30-36 小时。

### Sprint Goal

实现“登录后创建并查看 Issue”的完整业务闭环。

### 入口条件

- Sprint 0 出口条件全部满足。
- 数据库连接可用。
- 认证 Provider 已配置。

### Story 清单

- 用户登录和登出。
- 受保护 Dashboard。
- Workspace 初始化。
- 创建 Issue。
- 编辑 Issue 标题、描述和状态。
- 删除 Issue。
- 列表视图。
- 服务端身份和输入校验。
- 使用 Credentials Provider 完成邮箱或用户名登录，密码不可明文存储。

### 出口条件

- 未登录不能访问 Dashboard。
- 用户只能看到自己的 Workspace 数据。
- 创建、编辑、删除失败时有明确反馈。
- Issue 数据刷新后仍然存在。
- 核心 CRUD 有单元测试。
- 登录 → 创建 Issue → 修改状态有一条 E2E。

### 可交付增量

用户可以登录并使用列表视图管理任务。

## Sprint 2：核心看板

### 时间

6-7 天，约 36-40 小时。

### Sprint Goal

实现稳定可用的看板和拖拽改状态流程。

### 入口条件

- Sprint 1 CRUD 和权限测试通过。
- 已有稳定的 Issue 数据模型。
- 预览环境可正常登录。

### Story 清单

- 四列看板：Backlog、Todo、In Progress、Done。
- Issue 卡片展示。
- 拖拽更新状态。
- 拖拽失败时恢复原状态。
- 乐观更新和加载状态。
- 空看板和空列状态。
- 解释 DOM 事件、事件冒泡和拖拽库工作方式。

### 出口条件

- 拖拽后状态持久化。
- 网络失败时回滚到拖拽前状态并显示错误提示，不留下虚假成功状态。
- 看板刷新后顺序和状态正确。
- 看板主流程有 E2E。
- 至少覆盖一个拖拽失败测试场景。
- 桌面端主要分辨率下无布局重叠。

### 可交付增量

用户可以在列表和看板之间切换，并通过拖拽管理任务状态。

## Sprint 3：AI 拆分任务

### 时间

6-7 天，约 36-40 小时。

### Sprint Goal

实现“自然语言输入 → AI 生成子任务 → 用户确认 → 批量创建”的闭环。

### 入口条件

- Sprint 2 看板流程稳定。
- AI Provider 和服务端 Key 可用。
- 已确定输出 Schema。

### Story 清单

- AI 输入表单。
- 服务端 AI 调用。
- 结构化子任务输出。
- Schema 校验。
- 用户编辑和确认结果。
- 批量创建子任务。
- 超时、失败和重试。
- 简单请求频率限制。
- Token 或请求次数统计。

### 出口条件

- API Key 不出现在客户端。
- AI 输出不符合 Schema 时不会写库。
- AI 请求失败时不会创建部分数据。
- 用户确认后才批量写入数据库。
- 至少覆盖成功、超时、无效输出三类测试。
- AI 使用记录已写入面试证据文档。
- DeepSeek API Key 只存在服务端环境变量中。

### 可交付增量

用户可以用自然语言快速生成并创建多个任务。

## Sprint 4：面试化交付和质量收尾

### 时间

4-5 天，约 24-30 小时。

### Sprint Goal

将 MVP 整理为可以稳定演示、解释和复盘的项目。

### 入口条件

- P0 功能全部完成。
- 核心 E2E 通过。
- 没有未解决的高优先级缺陷。

### Story 清单

- 完善 README。
- 完成架构图和 ADR。
- 编写 React vs Vue 原理对比文档。
- 可选实现 Vue 看板对比模块。
- 基础响应式和可访问性修复。
- Lighthouse 建立基线并完成高收益优化。
- 录制演示视频。
- 将应用部署到腾讯云 Lighthouse/ECS。
- 配置 Docker Compose、Nginx 和 HTTPS。
- 记录应用重启、数据库迁移和备份恢复步骤。
- 整理面试证据。
- 完成 Retrospective。

### 出口条件

- MVP 演示流程不超过 5 分钟。
- 部署链接稳定可访问。
- README 包含启动、环境变量、架构和测试说明。
- 面试证据文档包含代码位置和验证结果。
- 所有 P0 缺陷关闭或有明确记录。
- 已保留剩余技术债 Backlog。

### 可交付增量

一个可访问、可演示、可讲解的 MVP 项目。

## 3. 降级规则

如果进度落后，按以下顺序降级：

1. 移除 Vue 对比模块。
2. 移除动画和暗黑模式。
3. 移除搜索和筛选。
4. 移除 Token 统计的展示页面，只保留服务端记录。
5. AI 只保留任务拆分，不实现其他 AI 功能。
6. 不降低认证、权限、核心测试和部署质量。
7. 不降低 Docker 化、数据库迁移和国内线上部署质量。
