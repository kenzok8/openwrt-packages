#!/bin/sh
# luci-app-openclaw — 公共路径与探测函数
# oc-config.sh / luci-helper / init.d 三个入口共用，避免各自硬编码同一批路径

OC_NODE_BASE="${OC_NODE_BASE:-/opt/openclaw/node}"
OC_GLOBAL="${OC_GLOBAL:-/opt/openclaw/global}"
OC_DATA="${OC_DATA:-/opt/openclaw/data}"
OC_NODE="${OC_NODE_BASE}/bin/node"
OC_STATE_DIR="${OC_DATA}/.openclaw"
OC_CONFIG="${OC_STATE_DIR}/openclaw.json"

# 配置和凭据归 openclaw 用户，脚本以 root 跑完要交还
oc_fix_owner() {
	chown openclaw:openclaw "$1" 2>/dev/null || true
}

# oc_port_listening <port>
oc_port_listening() {
	local p="$1"
	if command -v ss >/dev/null 2>&1; then
		ss -ltn 2>/dev/null | grep -q ":${p} "
	else
		netstat -tln 2>/dev/null | grep -q ":${p} "
	fi
}

# oc_pid_by_port <port>
oc_pid_by_port() {
	local p="$1"
	if command -v ss >/dev/null 2>&1; then
		ss -tlnp 2>/dev/null | grep ":${p} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
	else
		netstat -tlnp 2>/dev/null | grep ":${p} " | sed -n 's|.* \([0-9]*\)/.*|\1|p' | head -1
	fi
}

# 找 openclaw 包目录与入口文件，结果写 OC_PKG_DIR / OC_ENTRY
oc_find_entry() {
	local d ver_dir link_dir real_dir
	OC_PKG_DIR=""
	OC_ENTRY=""
	for d in "${OC_GLOBAL}/lib/node_modules/openclaw" "${OC_GLOBAL}/node_modules/openclaw" "${OC_NODE_BASE}/lib/node_modules/openclaw" "${OC_GLOBAL}"/*/node_modules/openclaw; do
		[ -d "$d" ] || continue
		OC_PKG_DIR="$d"
		break
	done
	# pnpm store 与符号链接包装都要跟随真实路径
	if [ -z "$OC_PKG_DIR" ]; then
		for link_dir in "${OC_GLOBAL}/lib/node_modules/openclaw" "${OC_GLOBAL}/node_modules/openclaw"; do
			[ -L "$link_dir" ] || continue
			real_dir=$(readlink -f "$link_dir" 2>/dev/null)
			[ -n "$real_dir" ] && [ -d "$real_dir" ] && { OC_PKG_DIR="$real_dir"; break; }
		done
	fi
	[ -n "$OC_PKG_DIR" ] || return 1
	if [ -f "${OC_PKG_DIR}/openclaw.mjs" ]; then
		OC_ENTRY="${OC_PKG_DIR}/openclaw.mjs"
	elif [ -f "${OC_PKG_DIR}/dist/cli.js" ]; then
		OC_ENTRY="${OC_PKG_DIR}/dist/cli.js"
	fi
	[ -n "$OC_ENTRY" ]
}

# oc_version_gt <a> <b> — a 比 b 新时输出 1，否则 0；按点分段当数字比
oc_version_gt() {
	awk -v a="$1" -v b="$2" 'BEGIN {
		n = split(a, A, "."); m = split(b, B, "."); L = (n > m ? n : m)
		for (i = 1; i <= L; i++) {
			x = A[i] + 0; y = B[i] + 0
			if (x > y) { print 1; exit }
			if (x < y) { print 0; exit }
		}
		print 0
	}'
}
