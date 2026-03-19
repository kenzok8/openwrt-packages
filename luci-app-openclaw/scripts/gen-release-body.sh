#!/bin/bash
# 用法: gen-release-body.sh <版本号> <CHANGELOG路径> <输出目录>
# 为指定版本生成 GitHub Release body markdown 文件
set -e

VER="$1"
CHANGELOG_FILE="$2"
OUT_DIR="$3"

if [ -z "$VER" ] || [ -z "$CHANGELOG_FILE" ] || [ -z "$OUT_DIR" ]; then
  echo "用法: $0 <版本号> <CHANGELOG路径> <输出目录>"
  exit 1
fi

mkdir -p "$OUT_DIR"

# 提取该版本的 changelog
CONTENT=$(awk "/^## \\[${VER}\\]/{found=1; next} /^## \\[/{if(found) exit} found{print}" "$CHANGELOG_FILE")
if [ -z "$CONTENT" ]; then
  CONTENT="暂无更新日志"
fi

# 写入文件
{
  printf '%s\n' "$CONTENT"
  echo ""
  echo "---"
  echo ""
  echo '**在线安装** (需联网，自动下载 Node.js + OpenClaw)'
  echo '```'
  echo '# iStoreOS'
  echo "sh luci-app-openclaw_${VER}.run"
  echo ''
  echo '# OpenWrt'
  echo "opkg install luci-app-openclaw_${VER}-1_all.ipk"
  echo '```'
  echo ''
  echo '[使用文档](https://github.com/10000ge10000/luci-app-openclaw#readme) · [问题反馈](https://github.com/10000ge10000/luci-app-openclaw/issues) · [B站](https://space.bilibili.com/59438380) · [博客](https://blog.910501.xyz/)'
} > "${OUT_DIR}/${VER}.md"

echo "✓ ${VER}.md ($(wc -l < "${OUT_DIR}/${VER}.md") 行)"
