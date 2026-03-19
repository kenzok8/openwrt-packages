#!/bin/sh
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PKG_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
DIST_DIR="${1:-$PKG_DIR/dist}"

if [ -z "$OPENLIST_URL" ]; then
echo "错误: 请设置 OPENLIST_URL 环境变量"
exit 1
fi

if [ -z "$OPENLIST_TOKEN" ] && { [ -z "$OPENLIST_USER" ] || [ -z "$OPENLIST_PASS" ]; }; then
echo "错误: 请设置登录凭据"
exit 1
fi

UPLOAD_ROOT="${OPENLIST_PATH:-/}"
PKG_VERSION=$(cat "$PKG_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
UPLOAD_ROOT="${UPLOAD_ROOT%/}"
UPLOAD_SUBDIR="openclaw-在线安装"
OPENLIST_URL="${OPENLIST_URL%/}"

get_token() {
if [ -n "$OPENLIST_TOKEN" ]; then echo "$OPENLIST_TOKEN"; return; fi
local resp=$(curl -s -X POST "${OPENLIST_URL}/api/auth/login" \
-H "Content-Type: application/json" \
-d "{\"username\":\"${OPENLIST_USER}\",\"password\":\"${OPENLIST_PASS}\"}")
local token=$(echo "$resp" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//' | head -n 1)
if [ -z "$token" ]; then exit 1; fi
echo "$token"
}

create_remote_dir() {
curl -s -X POST "${OPENLIST_URL}/api/fs/mkdir" \
-H "Authorization: ${1}" \
-H "Content-Type: application/json" \
-d "{\"path\":\"${2}\"}" >/dev/null 2>&1 || true
}

upload_file() {
local filename=$(basename "$2")
echo "  上传: ${filename} ..."
local resp=$(curl -s -X PUT "${OPENLIST_URL}/api/fs/put" \
-H "Authorization: ${1}" \
-H "File-Path: ${3}/${filename}" \
-H "Content-Type: application/octet-stream" \
--data-binary "@${2}" \
--max-time 3600)
local code=$(echo "$resp" | grep -o '"code":[0-9]*' | grep -o '[0-9]*' | head -n 1)
if [ "$code" = "200" ]; then echo "  [✓] 上传成功"; else echo "  [✗] 失败: $resp"; fi
}

UPLOAD_FILES=$(find "$DIST_DIR" -type f -name "*.run" -o -name "*.ipk" 2>/dev/null)
if [ -z "$UPLOAD_FILES" ]; then echo "错误: 未找到可上传文件"; exit 1; fi

TOKEN=$(get_token)
REMOTE_DIR="${UPLOAD_ROOT}/${UPLOAD_SUBDIR}/v${PKG_VERSION}"
REMOTE_DIR=$(echo "$REMOTE_DIR" | sed 's#^//#/#g')

echo "创建远程目录: ${REMOTE_DIR}"
create_remote_dir "$TOKEN" "$REMOTE_DIR"

for f in $UPLOAD_FILES; do
upload_file "$TOKEN" "$f" "$REMOTE_DIR"
done
echo "✅ 上传完成！"
