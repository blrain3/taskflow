# TaskFlow 安全威胁模型

> 状态：规划中
> 维护阶段：MVP / 部署

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.1 |
| 最后更新 | 2026-09-11 |
| 文档状态 | 规划中（上线前门槛） |

## 1. 资产

- 用户账号和密码哈希
- JWT Session Cookie
- Workspace 和 Issue 数据
- DeepSeek API Key
- PostgreSQL 数据和备份
- 服务器 SSH 凭据与 TLS 私钥

## 2. 威胁与控制

会话安全基线：Auth.js JWT Cookie 必须设置 `HttpOnly`、生产环境 `Secure`、`SameSite=Lax`；JWT 有效期按 Auth.js 默认策略配置并在生产环境显式确认；`AUTH_SECRET` 使用高熵随机值，轮换时安排强制重新登录。JWT 无服务端撤销表，登出后旧 Token 在过期前仍可能有效，需通过缩短有效期和密钥轮换降低风险。

| 威胁 | 攻击面 | 当前控制 | 剩余风险 |
|---|---|---|---|
| 跨 Workspace 越权 | Action、Route、查询参数 | Session + WorkspaceMember + 查询条件；proxy.ts 框架层拦截未登录 | 需持续增加回归测试 |
| 暴力破解 | 登录入口（表单 **与** REST 凭据回调） | 统一错误文案；限流计数统一在 authorize()，两条路径同层受保护；邮箱失败桶 + 可信 IP 桶；用户不存在时以固定哈希对齐比对耗时（防计时枚举） | 仍需补失败审计和 Redis 共享存储；上线前确认代理覆写 Header **且** `TRUST_PROXY=true`——未配置时应用会跳过 IP 维度，注册接口无频次防护，需 Nginx `limit_req` 补齐 |
| CSRF / 伪造请求 | Server Action、Cookie | Auth.js Cookie、框架保护 | 上线前需 E2E 验证 |
| Prompt Injection | AI 输入 | 输入长度限制、人工确认 | 模型仍可能产生错误任务 |
| AI 输出污染 | AI 结果写库 | Zod 校验、确认后事务写入（`lib/issue-batch.ts`） | 需限制最大子任务数 |
| 密钥泄露 | 客户端构建、日志、Git | 服务端环境变量、`.env` 忽略 | 需定期扫描仓库 |
| 重复提交 | 表单、批量创建 | 批量创建：pending 禁用 + `requestId` 确定性主键幂等（主键含 workspaceId 前缀）；其余表单：pending 禁用 | requestId 由客户端生成，重装/清缓存后可能重复提交；需 E2E 验证幂等链路 |
| 拖拽并发覆盖 | 看板 Action | 在途卡片禁拖（有可见提示）、后写者赢 | 多用户协作不在 MVP |
| 备份泄露 | 服务器备份 | 文件不入 Git | 需加密和限制访问 |
| 内部服务暴露 | Nginx、Docker | 仅暴露 80/443；安全响应头（nosniff/DENY/HSTS/CSP-Report-Only）已在 `next.config.ts` 下发 | 需检查安全组；CSP 确认无误伤后从 Report-Only 切强制 |

## 3. 上线前安全门槛

- 所有受保护入口完成未登录和越权测试。
- `.env`、API Key、密码和 Token 扫描通过。
- AI 输入、输出和日志完成脱敏检查。
- PostgreSQL 只允许应用服务器或内网访问。
- SSH 禁止弱密码，优先使用密钥登录。
- HTTPS、备份和回滚流程演练完成。
- Nginx 已覆写 `X-Forwarded-For` 且应用 `TRUST_PROXY="true"`；否则确认已接受「IP 维度限流整体跳过、注册无频次防护」的现状并用 Nginx `limit_req` 补齐。
- 冒烟含「REST 回调限流覆盖」断言且通过（`npm run smoke`）。
