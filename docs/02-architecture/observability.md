# TaskFlow 可观测性规范

> 状态：规划中
> 维护阶段：部署

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.1 |
| 最后更新 | 2026-09-11 |
| 文档状态 | 规划中（现状缺口已标注） |

## 1. 目标

能够定位认证、Issue、AI、数据库和部署问题，同时不泄露用户敏感数据。

## 2. 结构化日志字段（目标）

- `timestamp`
- `level`
- `requestId`
- `route`
- `userId`（可选）
- `workspaceId`（可选）
- `durationMs`
- `statusCode`
- `errorCode`
- `aiModel`（AI 请求）
- `inputTokens` / `outputTokens`（AI 请求）

## 3. 日志规则

- 生产日志使用 JSON 格式，便于腾讯云日志检索。
- 错误日志保留内部错误上下文，但返回用户的文案必须安全化。
- 禁止记录密码、API Key、Session Token、数据库连接串和未经脱敏的完整 AI 输入。
- 每个请求尽可能携带 `requestId`，跨 Action、Route Handler 和数据库日志保持一致。
- AI 超时、限流、Schema 失败和上游 5xx 使用不同 `errorCode`。

## 4. 健康检查

- `/api/health` 检查应用配置和数据库连接。
- 缺少基础环境变量或数据库不可用时返回 503。
- AI 配置缺失只标记为功能禁用，不应导致基础应用永久 unhealthy。

## 5. 当前缺口

- 当前代码主要使用 `console.log/error`，尚未统一输出 JSON，也未在所有请求中注入 `requestId`、`durationMs` 或 Token usage；以下字段是目标契约，不代表已实现能力。
- 尚未固定日志库和日志采集保存周期。
- 尚未配置腾讯云告警规则。
- 上线前必须补充请求 ID、日志轮转和错误告警方案。
