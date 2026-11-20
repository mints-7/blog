#!/usr/bin/env bash
# 新建一篇文章：./new-post.sh "文章标题" [英文短名]
#
# 例：
#   ./new-post.sh "第一次跑马拉松"
#   ./new-post.sh "Rust 所有权笔记" rust-ownership
#
# 生成的草稿默认 draft: true（不会发布），写完把 draft 改成 false 再 ./deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SITE="$ROOT/blog"
POSTS="$SITE/content/posts"

if [ $# -lt 1 ]; then
  echo '用法：./new-post.sh "文章标题" [英文短名]'
  exit 1
fi

TITLE="$1"
SLUG="${2:-}"

# 没给短名就从标题里抽英文字母数字；中文标题抽不出来就用日期
if [ -z "$SLUG" ]; then
  SLUG="$(printf '%s' "$TITLE" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//')"
  [ -n "$SLUG" ] || SLUG="post-$(date +%Y%m%d)"
fi

FILE="$POSTS/${SLUG}.md"
if [ -e "$FILE" ]; then
  echo "文件已存在：${FILE#$ROOT/}"
  exit 1
fi

mkdir -p "$POSTS"
DATE="$(date +%Y-%m-%dT%H:%M:%S%z)"

cat > "$FILE" <<EOF
---
title: "$TITLE"
date: $DATE
draft: true
summary: ""
tags: []
categories: []
---

用一两句话说清这篇文章要讲什么，这段会出现在列表页和搜索结果里。

<!--more-->

## 第一个小标题

正文从这里开始。

EOF

echo "已创建：${FILE#$ROOT/}"
echo
echo "下一步："
echo "  1. 编辑上面这个文件（VSCode / Obsidian / 任意编辑器都行）"
echo "  2. 本地预览：./preview.sh"
echo "  3. 写完把 draft: true 改成 false"
echo "  4. 发布：./deploy/deploy.sh"
