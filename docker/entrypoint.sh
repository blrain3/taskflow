#!/bin/sh
# TaskFlow 容器入口：先执行数据库迁移，再启动应用。
# 迁移失败会重试，超过上限则退出，避免应用带着过期 schema 起来。
set -e

MAX_ATTEMPTS=30
attempt=1

while true; do
  if npx prisma migrate deploy; then
    break
  fi

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] 数据库迁移连续失败 ${MAX_ATTEMPTS} 次，退出。" >&2
    echo "[entrypoint] 排查建议：" >&2
    echo "  1. 确认 db 服务已健康：docker compose -f docker-compose.yml ps" >&2
    echo "  2. 确认 .env 中的 DATABASE_URL / POSTGRES_* 一致" >&2
    echo "  3. 查看数据库日志：docker compose -f docker-compose.yml logs db" >&2
    exit 1
  fi

  echo "[entrypoint] 数据库尚未就绪或迁移失败，第 ${attempt}/${MAX_ATTEMPTS} 次重试..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

echo "[entrypoint] 迁移完成，启动应用。"
exec "$@"
