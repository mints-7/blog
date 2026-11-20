#!/usr/bin/env bash
# 本地预览博客（含草稿）：./preview.sh
# 打开 http://127.0.0.1:1313/ ，改文件会自动刷新。Ctrl+C 退出。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HUGO="$ROOT/.tools/hugo-new"

[ -x "$HUGO" ] || { echo "找不到 Hugo：$HUGO"; exit 1; }

echo "==> 预览地址：http://127.0.0.1:1313/"
echo "==> 已开启草稿（draft: true 也能看到），Ctrl+C 退出"
echo

exec "$HUGO" server \
  --source "$ROOT/blog" \
  --bind 127.0.0.1 \
  --port 1313 \
  --buildDrafts \
  --buildFuture \
  --disableFastRender
