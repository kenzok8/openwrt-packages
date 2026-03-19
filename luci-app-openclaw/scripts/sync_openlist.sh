#!/bin/sh
# ============================================================================
# OpenList 网盘同步脚本 — 补齐所有历史版本 + 上传更新记录
#
# 功能:
#   1. 从 GitHub Releases 下载所有版本的 .run + .ipk
#   2. 从 CHANGELOG.md 提取每个版本的更新记录，生成 更新记录.txt
#   3. 上传到 OpenList 网盘的 openclaw-在线安装 目录
#
# 用法:
#   sh scripts/sync_openlist.sh
# ============================================================================
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PKG_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

# ── 配置 ──
GITHUB_REPO="10000ge10000/luci-app-openclaw"
OPENLIST_URL="http://124.243.178.237:15244"
OPENLIST_USER="admin"
OPENLIST_PASS="mingmenmama"
OPENLIST_ROOT="/Quark"
UPLOAD_SUBDIR="openclaw-在线安装"
CHANGELOG="$PKG_DIR/CHANGELOG.md"
WORK_DIR="/tmp/openlist-sync"

# 所有已发布的版本 (按时间顺序)
ALL_VERSIONS="1.0.0 1.0.1 1.0.2 1.0.3 1.0.4 1.0.5 1.0.6 1.0.7 1.0.8 1.0.9 1.0.10 1.0.11 1.0.12 1.0.14 1.0.15"

log_info()  { printf "  [\033[32m✓\033[0m] %s\n" "$1"; }
log_warn()  { printf "  [\033[33m!\033[0m] %s\n" "$1"; }
log_error() { printf "  [\033[31m✗\033[0m] %s\n" "$1"; }
log_skip()  { printf "  [\033[36m-\033[0m] %s\n" "$1"; }

# ── 获取 Token ──
get_token() {
	local resp
	resp=$(curl -s -X POST "${OPENLIST_URL}/api/auth/login" \
		-H "Content-Type: application/json" \
		-d "{\"username\":\"${OPENLIST_USER}\",\"password\":\"${OPENLIST_PASS}\"}")

	local token
	token=$(echo "$resp" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')

	if [ -z "$token" ]; then
		log_error "OpenList 登录失败"
		echo "  响应: $resp"
		exit 1
	fi
	echo "$token"
}

# ── 创建远程目录 ──
create_remote_dir() {
	local token="$1"
	local remote_path="$2"
	curl -s -X POST "${OPENLIST_URL}/api/fs/mkdir" \
		-H "Authorization: ${token}" \
		-H "Content-Type: application/json" \
		-d "{\"path\":\"${remote_path}\"}" >/dev/null 2>&1 || true
}

# ── 检查远程文件是否存在 ──
remote_file_exists() {
	local token="$1"
	local remote_path="$2"
	local filename="$3"

	local resp
	resp=$(curl -s -X POST "${OPENLIST_URL}/api/fs/list" \
		-H "Authorization: ${token}" \
		-H "Content-Type: application/json" \
		-d "{\"path\":\"${remote_path}\",\"refresh\":false}")

	echo "$resp" | grep -q "\"name\":\"${filename}\""
}

# ── 上传单个文件 ──
upload_file() {
	local token="$1"
	local local_file="$2"
	local remote_path="$3"
	local filename=$(basename "$local_file")
	local fsize=$(du -h "$local_file" | cut -f1)

	local resp
	resp=$(curl -s -X PUT "${OPENLIST_URL}/api/fs/put" \
		-H "Authorization: ${token}" \
		-H "File-Path: ${remote_path}/${filename}" \
		-H "Content-Type: application/octet-stream" \
		--data-binary "@${local_file}" \
		--max-time 300 2>/dev/null)

	local code=""
	code=$(echo "$resp" | grep -o '"code":[0-9]*' | grep -o '[0-9]*')

	if [ "$code" = "200" ]; then
		log_info "${filename} (${fsize}) 上传成功"
	else
		log_error "${filename} 上传失败: $resp"
	fi
}

# ── 从 CHANGELOG.md 提取指定版本的更新日志 ──
extract_changelog() {
	local version="$1"
	local output_file="$2"

	awk "/^## \\[${version}\\]/{found=1; next} /^## \\[/{if(found) exit} found{print}" \
		"$CHANGELOG" > "$output_file"

	# 去掉首尾空行
	sed -i '/./,$!d' "$output_file"          # 去掉开头空行
	sed -i ':a; /^[[:space:]]*$/{ $d; N; ba }' "$output_file"  # 去掉末尾空行 (GNU sed)

	if [ ! -s "$output_file" ]; then
		echo "暂无更新日志" > "$output_file"
	fi
}

# ── 从 GitHub 下载文件 ──
download_release_file() {
	local version="$1"
	local filename="$2"
	local output="$3"

	local url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}"

	if [ -f "$output" ]; then
		log_skip "${filename} 已在本地缓存"
		return 0
	fi

	if curl -sL --fail -o "$output" "$url" 2>/dev/null; then
		# 检查是否为有效文件 (排除 GitHub 返回 Not Found HTML)
		local size=$(wc -c < "$output")
		if [ "$size" -lt 1000 ]; then
			local content=$(cat "$output")
			if echo "$content" | grep -qi "not found"; then
				rm -f "$output"
				return 1
			fi
		fi
		return 0
	else
		rm -f "$output"
		return 1
	fi
}

# ══════════════════════════════════════════════════════════════
#  主流程
# ══════════════════════════════════════════════════════════════

echo ""
echo "================================================================"
echo "  OpenList 网盘同步 — 补齐所有历史版本"
echo "================================================================"
echo ""

# 准备工作目录
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

# 登录
echo "正在登录 OpenList..."
TOKEN=$(get_token)
log_info "登录成功"
echo ""

TOTAL_UPLOADED=0

for VER in $ALL_VERSIONS; do
	echo "── v${VER} ──────────────────────────────────────"
	REMOTE_DIR="${OPENLIST_ROOT}/${UPLOAD_SUBDIR}/v${VER}"
	VER_DIR="${WORK_DIR}/v${VER}"
	mkdir -p "$VER_DIR"

	# 创建远程目录
	create_remote_dir "$TOKEN" "$REMOTE_DIR"

	# 1) 下载 .run
	RUN_FILE="luci-app-openclaw_${VER}.run"
	if remote_file_exists "$TOKEN" "$REMOTE_DIR" "$RUN_FILE"; then
		log_skip "${RUN_FILE} 已存在于网盘"
	else
		echo "  下载 ${RUN_FILE}..."
		if download_release_file "$VER" "$RUN_FILE" "${VER_DIR}/${RUN_FILE}"; then
			upload_file "$TOKEN" "${VER_DIR}/${RUN_FILE}" "$REMOTE_DIR"
			TOTAL_UPLOADED=$((TOTAL_UPLOADED + 1))
		else
			log_error "${RUN_FILE} 下载失败"
		fi
	fi

	# 2) 下载 .ipk
	IPK_FILE="luci-app-openclaw_${VER}-1_all.ipk"
	if remote_file_exists "$TOKEN" "$REMOTE_DIR" "$IPK_FILE"; then
		log_skip "${IPK_FILE} 已存在于网盘"
	else
		echo "  下载 ${IPK_FILE}..."
		if download_release_file "$VER" "$IPK_FILE" "${VER_DIR}/${IPK_FILE}"; then
			upload_file "$TOKEN" "${VER_DIR}/${IPK_FILE}" "$REMOTE_DIR"
			TOTAL_UPLOADED=$((TOTAL_UPLOADED + 1))
		else
			log_error "${IPK_FILE} 下载失败"
		fi
	fi

	# 3) 生成并上传 更新记录.txt
	CHANGELOG_FILE="更新记录.txt"
	if remote_file_exists "$TOKEN" "$REMOTE_DIR" "$CHANGELOG_FILE"; then
		log_skip "${CHANGELOG_FILE} 已存在于网盘"
	else
		extract_changelog "$VER" "${VER_DIR}/${CHANGELOG_FILE}"
		upload_file "$TOKEN" "${VER_DIR}/${CHANGELOG_FILE}" "$REMOTE_DIR"
		TOTAL_UPLOADED=$((TOTAL_UPLOADED + 1))
	fi

	echo ""
done

# 清理
rm -rf "$WORK_DIR"

echo "================================================================"
echo "  同步完成！共上传 ${TOTAL_UPLOADED} 个文件"
echo "================================================================"
echo ""
