# 第一阶段 User Stories：单人写作 MVP

> 状态：提案，待产品方向确认
> 版本：v2.0
> 最后更新：2026-09-13
> 关联：`mvp-scope.md`、`definition-of-done.md`

## US-DOC-001 注册并进入 Workspace

作为新用户，我希望注册后进入自己的 Workspace，以便开始写作。

### 验收标准

- Given 用户提交合法且未注册的邮箱和密码，When 注册成功，Then 创建用户并进入默认 Workspace。
- Given 邮箱已经存在，When 用户提交注册，Then 返回统一冲突提示，不创建第二个用户。
- Given 用户未登录，When 访问文档页面，Then 被重定向到登录页。

## US-DOC-002 邀请 Workspace 成员

作为 Workspace 成员，我希望邀请其他用户加入工作区，以便后续共享文档。

### 验收标准

- Given 当前用户具有邀请权限，When 提交合法邮箱，Then 创建待接受邀请并显示邀请状态。
- Given 当前用户不是 Workspace 成员，When 调用邀请接口，Then 返回 FORBIDDEN 且不写入邀请。
- Given 相同 Workspace 和邮箱已有有效邀请，When 再次邀请，Then 返回冲突提示而不产生重复邀请。

## US-DOC-003 创建文档

作为用户，我希望创建标题和正文为空的文档，以便开始写作。

### 验收标准

- Given 用户已登录且属于 Workspace，When 提交合法标题，Then 创建文档并出现在列表中。
- Given 标题为空或超过限制，When 提交表单，Then 返回字段错误且数据库没有新文档。
- Given 用户不属于目标 Workspace，When 提交创建请求，Then 返回 FORBIDDEN。

## US-DOC-004 编辑并保存文档

作为作者，我希望编辑正文并保存，以便内容持久化。

### 验收标准

- Given 用户拥有文档编辑权限，When 保存合法 Markdown/富文本内容，Then 更新文档并记录新的版本。
- Given 保存成功，When 刷新页面，Then 标题和正文与最后一次成功保存一致。
- Given 保存请求携带过期版本号，When 数据库版本已变化，Then 返回 CONFLICT，不覆盖较新的内容。

## US-DOC-005 自动保存

作为作者，我希望停止输入后自动保存，避免忘记点击保存。

### 验收标准

- Given 编辑器内容发生变化，When 防抖时间结束且内容仍未保存，Then 发起一次保存请求。
- Given 自动保存请求进行中，When 用户继续输入，Then 不丢失本地草稿，并在请求完成后保存最新内容。
- Given 自动保存失败，When 网络恢复或用户点击重试，Then 可以再次保存且显示明确错误状态。

## US-DOC-006 查看文档列表与权限

作为成员，我希望只看到有权访问的文档。

### 验收标准

- Given 用户属于 Workspace，When 打开文档列表，Then 只返回该 Workspace 内授权文档并按 `updatedAt desc, id desc` 排序。
- Given 用户不属于 Workspace，When 查询或猜测文档 ID，Then 返回统一 FORBIDDEN/NOT_FOUND，不泄露文档存在性。
- Given 文档已删除，When 再次打开其地址，Then 返回 NOT_FOUND。

## US-DOC-007 查看和恢复版本历史

作为作者，我希望查看历史版本并恢复，以便撤销错误修改。

### 验收标准

- Given 文档有多次成功保存，When 打开版本历史，Then 按版本号倒序显示保存时间和作者。
- Given 用户选择一个历史版本，When 点击恢复，Then 创建新的当前版本，原历史版本保持不变。
- Given 用户无编辑权限，When 尝试恢复版本，Then 返回 FORBIDDEN 且正文不变。

## US-DOC-008 AI 生成大纲

作为作者，我希望输入主题后生成大纲，以便快速开始写作。

### 验收标准

- Given 用户已登录且输入合法主题，When 请求大纲，Then 服务端返回结构化章节列表。
- Given AI 返回无效 JSON、超时或上游错误，When 请求结束，Then 返回统一错误，不修改文档正文。
- Given 客户端没有真实 AI Key，When 运行测试，Then 使用 Mock Provider 验证成功、超时和无效输出。

## US-DOC-009 AI 润色和摘要

作为作者，我希望让 AI 润色正文或生成摘要，并由我确认结果。

### 验收标准

- Given 用户提交正文或选中文本，When 请求润色，Then 返回候选文本且原文保持不变。
- Given 用户确认润色结果，When 保存文档，Then 新版本包含确认后的内容。
- Given 用户请求摘要，When AI 返回有效摘要，Then 结果可复制或保存到摘要字段；失败时不覆盖已有摘要。

## US-DOC-010 第一阶段不实现实时协作

作为产品负责人，我希望明确第一阶段边界，以便控制风险。

### 验收标准

- Given 第一阶段代码和部署，When 检查依赖与路由，Then 不存在 WebSocket、CRDT、OT、在线光标和实时同步实现。
- Given 两个客户端同时编辑，When 后提交者携带过期版本号保存，Then 服务端返回 CONFLICT，不静默覆盖先前版本。
