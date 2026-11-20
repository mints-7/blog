#!/usr/bin/env bash
# 构建博客并把 public/ 推到服务器（原子切换目录）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HUGO="$ROOT/.tools/hugo-new"
SITE="$ROOT/blog"
# 服务器地址不写进仓库（仓库是 public 的），放在 deploy/.deploy_host 里
HOST_FILE="$ROOT/deploy/.deploy_host"
HOST="${BLOG_HOST:-$(cat "$HOST_FILE" 2>/dev/null || true)}"
[ -n "$HOST" ] || { echo "缺少服务器地址：请创建 deploy/.deploy_host（内容示例：root@1.2.3.4），或设置 BLOG_HOST 环境变量"; exit 1; }
REMOTE_ROOT="/var/www/blog"
SSH_OPTS=(-i "$ROOT/deploy/.ssh/blog_deploy"
          -o IdentitiesOnly=yes
          -o StrictHostKeyChecking=accept-new
          -o UserKnownHostsFile="$ROOT/deploy/.ssh/known_hosts"
          -o ConnectTimeout=15)

[ -x "$HUGO" ] || { echo "找不到 Hugo：$HUGO"; exit 1; }
[ -f "$ROOT/deploy/.ssh/blog_deploy" ] || { echo "找不到部署私钥"; exit 1; }

BASE_URL="${1:-}"
BUILD_ARGS=(--source "$SITE" --gc --minify --cleanDestinationDir --logLevel warn)
if [ -n "$BASE_URL" ]; then
  BUILD_ARGS+=(--baseURL "$BASE_URL")
fi

echo "==> 构建"
"$HUGO" "${BUILD_ARGS[@]}"
echo "==> 上传 $(du -sh "$SITE/public" | cut -f1)"
tar czf - -C "$SITE/public" . | ssh "${SSH_OPTS[@]}" "$HOST" "
  set -e
  mkdir -p ${REMOTE_ROOT}.new
  rm -rf ${REMOTE_ROOT}.new/*
  tar xzf - -C ${REMOTE_ROOT}.new
  rm -rf ${REMOTE_ROOT}.old
  if [ -d ${REMOTE_ROOT} ]; then mv ${REMOTE_ROOT} ${REMOTE_ROOT}.old; fi
  mv ${REMOTE_ROOT}.new ${REMOTE_ROOT}
  rm -rf ${REMOTE_ROOT}.old
  chown -R www-data:www-data ${REMOTE_ROOT}
  echo '==> 服务器完成'
"
URL="${BASE_URL:-$(grep -m1 '^baseURL' "$SITE/hugo.toml" | sed 's/.*"\(.*\)"/\1/')}"
echo "==> 发布完成：$URL"
