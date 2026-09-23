# TaskFlow 国内部署运维手册

> 状态：执行中
> 维护阶段：部署
> 关联文档：[MVP 范围](../01-product/mvp-scope.md)、[架构说明](architecture.md)

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.2 |
| 最后更新 | 2026-09-12 |
| 文档状态 | 执行中 |

## 1. 服务器准备

- 腾讯云 Lighthouse 或 ECS。
- Ubuntu 22.04 LTS。
- 开放 SSH、80、443 端口，限制 SSH 来源 IP。
- 安装 Docker、Docker Compose、Nginx、Certbot 和 Git。
- 生产使用 `docker-compose.prod.yml`，数据库使用腾讯云 PostgreSQL，不运行或暴露公网 PostgreSQL 容器。

## 2. 首次部署

```bash
git clone <repository-url> /opt/taskflow
cd /opt/taskflow
cp .env.example .env
# 编辑 .env，填入生产 DATABASE_URL、AUTH_SECRET 和 AI 配置
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl -f http://127.0.0.1:3000/api/health
```

容器启动脚本必须先执行 `prisma migrate deploy`，成功后才启动 Next.js。

**环境变量注意**：`.env` 中 `TRUST_PROXY` 只有在 Nginx 已配置 `proxy_set_header X-Forwarded-For $remote_addr;` 时才设为 `true`。未设置（默认 `false`）时应用会跳过按 IP 的限流——登录仍有按邮箱的失败计数保护，但**注册接口没有频次防护**，需在 Nginx 层对认证路径加 `limit_req` 补齐（见 `security-threat-model.md` §3）。

## 3. Nginx 和 HTTPS

- Nginx 只暴露 80/443，将请求反向代理到 Next.js 容器。
- 生产 Compose 只绑定 `127.0.0.1:3000`，PostgreSQL 5432 不得绑定公网地址。
- 使用 Certbot 申请和续期证书。
- HTTPS 配置完成后验证登录、Issue、看板和 AI 路径。
- 中国大陆地域绑定正式域名前先确认 ICP 备案；学习阶段可用香港地域或公网 IP。

## 4. 发布与回滚

1. CI 通过当前已接入的质量检查后构建镜像；测试工具接入后必须加入 test 和 E2E 门禁。
2. 服务器拉取指定版本镜像。
3. 发布前执行数据库备份。
4. 执行 `docker compose -f docker-compose.prod.yml up -d`。
5. 检查 `/api/health` 和关键业务流程。
6. 失败时切回上一版本镜像；数据库迁移不可逆变更必须提前评审。

## 5. 备份与恢复

```bash
pg_dump "$DATABASE_URL" > backups/taskflow-$(date +%F).sql
psql "$DATABASE_URL" < backups/taskflow-YYYY-MM-DD.sql
```

至少每周备份一次，备份文件不得提交 Git。上线前至少完整演练一次恢复，并记录耗时和结果。

## 6. 常见故障

| 现象 | 检查 | 处理 |
|---|---|---|
| 503 | `docker compose -f docker-compose.prod.yml ps`、`/api/health` | 检查数据库和基础环境变量 |
| 登录失败 | `AUTH_SECRET`、Cookie、反向代理 Host | 确认 `AUTH_TRUST_HOST=true` 和 HTTPS |
| AI 不可用 | AI Key、端点、模型和日志 | 暂停 AI 入口，保留手动创建任务 |
| 数据库迁移失败 | 容器日志和迁移历史 | 停止发布，恢复备份后再处理 |
| 证书过期 | `certbot certificates` | 执行续期并 reload Nginx |
