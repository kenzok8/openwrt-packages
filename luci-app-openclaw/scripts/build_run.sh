#!/bin/sh
# ============================================================================
# iStoreOS .run 自解压包构建脚本
# 用法: sh scripts/build_run.sh [output_dir]
# ============================================================================
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PKG_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
OUT_DIR="${1:-$PKG_DIR/dist}"
# 确保 OUT_DIR 是绝对路径
case "$OUT_DIR" in
	/*) ;;
	*) OUT_DIR="$PKG_DIR/$OUT_DIR" ;;
esac
mkdir -p "$OUT_DIR"
PKG_NAME="luci-app-openclaw"
PKG_VERSION=$(cat "$PKG_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "1.0.0")

echo "=== 构建 iStoreOS .run 安装包 ==="
echo "源目录: $PKG_DIR"
echo "输出到: $OUT_DIR"

# 创建临时打包目录
STAGING=$(mktemp -d)
trap "rm -rf '$STAGING'" EXIT

# 安装文件到暂存区
install_files() {
	local dest="$1"

	# UCI config (仅首次安装时部署默认配置; 升级时保留用户配置)
	# 安装器会在解压后检测并跳过已有配置, 见 install.sh 中的逻辑
	mkdir -p "$dest/etc/config"
	cp "$PKG_DIR/root/etc/config/openclaw" "$dest/etc/config/openclaw.default"

	# UCI defaults
	mkdir -p "$dest/etc/uci-defaults"
	cp "$PKG_DIR/root/etc/uci-defaults/99-openclaw" "$dest/etc/uci-defaults/"
	chmod +x "$dest/etc/uci-defaults/99-openclaw"

	# init.d
	mkdir -p "$dest/etc/init.d"
	cp "$PKG_DIR/root/etc/init.d/openclaw" "$dest/etc/init.d/"
	chmod +x "$dest/etc/init.d/openclaw"

	# profile.d (v1.0.16+: 全局环境变量)
	mkdir -p "$dest/etc/profile.d"
	cp "$PKG_DIR/root/etc/profile.d/openclaw.sh" "$dest/etc/profile.d/"
	chmod +x "$dest/etc/profile.d/openclaw.sh"

	# bin
	mkdir -p "$dest/usr/bin"
	cp "$PKG_DIR/root/usr/bin/openclaw-env" "$dest/usr/bin/"
	chmod +x "$dest/usr/bin/openclaw-env"

	# LuCI controller
	mkdir -p "$dest/usr/lib/lua/luci/controller"
	cp "$PKG_DIR/luasrc/controller/openclaw.lua" "$dest/usr/lib/lua/luci/controller/"

	# LuCI CBI
	mkdir -p "$dest/usr/lib/lua/luci/model/cbi/openclaw"
	cp "$PKG_DIR/luasrc/model/cbi/openclaw/"*.lua "$dest/usr/lib/lua/luci/model/cbi/openclaw/"

	# LuCI views
	mkdir -p "$dest/usr/lib/lua/luci/view/openclaw"
	cp "$PKG_DIR/luasrc/view/openclaw/"*.htm "$dest/usr/lib/lua/luci/view/openclaw/"

	# oc-config assets
	mkdir -p "$dest/usr/share/openclaw"
	cp "$PKG_DIR/VERSION" "$dest/usr/share/openclaw/VERSION"
	cp "$PKG_DIR/root/usr/share/openclaw/oc-config.sh" "$dest/usr/share/openclaw/"
	chmod +x "$dest/usr/share/openclaw/oc-config.sh"
	cp "$PKG_DIR/root/usr/share/openclaw/web-pty.js" "$dest/usr/share/openclaw/"

	# Web PTY UI (recursive copy)
	cp -r "$PKG_DIR/root/usr/share/openclaw/ui" "$dest/usr/share/openclaw/"
}

# 创建安装器脚本头部
create_installer() {
	cat > "$STAGING/install.sh" << 'INSTALLER_EOF'
#!/bin/sh
# luci-app-openclaw iStoreOS 安装器
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       luci-app-openclaw — OpenClaw AI Gateway 插件           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 检查系统
if [ ! -f /etc/openwrt_release ]; then
	echo "错误: 此安装包仅适用于 OpenWrt/iStoreOS 系统"
	exit 1
fi

# 检查架构
ARCH=$(uname -m)
case "$ARCH" in
	x86_64|aarch64) ;;
	*) echo "错误: 不支持的架构 $ARCH (仅支持 x86_64/aarch64)"; exit 1 ;;
esac

# 检查依赖
for dep in luci-compat luci-base; do
	if ! opkg list-installed 2>/dev/null | grep -q "^${dep} "; then
		echo "警告: 缺少依赖 $dep，尝试安装..."
		opkg update >/dev/null 2>&1 || true
		opkg install "$dep" 2>/dev/null || echo "  安装 $dep 失败，请手动安装"
	fi
done

echo "正在安装文件..."

# 解压 payload (从 MARKER 行之后)
ARCHIVE=$(awk '/^__ARCHIVE_BELOW__/ {print NR + 1; exit 0; }' "$0")
tail -n +$ARCHIVE "$0" | tar xzf - -C / 2>/dev/null

# UCI 配置文件保护: 升级时不覆盖用户已有配置
if [ -f /etc/config/openclaw ] && [ -f /etc/config/openclaw.default ]; then
	# 已有配置, 移除默认文件 (保留用户配置)
	rm -f /etc/config/openclaw.default
elif [ -f /etc/config/openclaw.default ]; then
	# 首次安装, 使用默认配置
	mv /etc/config/openclaw.default /etc/config/openclaw
fi

# 注册到 opkg，使 iStore 和 opkg 能识别此包
PKG="luci-app-openclaw"
PKG_VER="__PKG_VERSION__"
INFO_DIR="/usr/lib/opkg/info"
STATUS_FILE="/usr/lib/opkg/status"
INSTALL_TIME=$(date +%s)

mkdir -p "$INFO_DIR"

# 写入 control 文件
cat > "$INFO_DIR/$PKG.control" << CTLEOF
Package: $PKG
Version: $PKG_VER
Depends: luci-compat, luci-base, curl, openssl-util, script-utils, tar, libstdcpp6
Section: luci
Architecture: all
Installed-Size: 0
Description: OpenClaw AI Gateway — LuCI 界面
CTLEOF

# 写入文件列表 (payload 中已安装的文件)
cat > "$INFO_DIR/$PKG.list" << LISTEOF
__FILE_LIST__
LISTEOF

# 写入 prerm 脚本 (卸载前执行)
cat > "$INFO_DIR/$PKG.prerm" << 'RMEOF'
#!/bin/sh
/etc/init.d/openclaw stop 2>/dev/null
/etc/init.d/openclaw disable 2>/dev/null
exit 0
RMEOF
chmod +x "$INFO_DIR/$PKG.prerm"

# 追加到 opkg status 数据库 (先移除旧记录)
if [ -f "$STATUS_FILE" ]; then
	awk -v pkg="$PKG" '
		BEGIN { skip=0 }
		/^Package:/ { skip=($2==pkg) }
		/^$/ { if(skip){skip=0; next} }
		!skip { print }
	' "$STATUS_FILE" > "${STATUS_FILE}.tmp"
	mv "${STATUS_FILE}.tmp" "$STATUS_FILE"
fi

cat >> "$STATUS_FILE" << STEOF

Package: $PKG
Version: $PKG_VER
Depends: luci-compat, luci-base, curl, openssl-util, script-utils, tar, libstdcpp6
Status: install user installed
Architecture: all
Conffiles:
 /etc/config/openclaw 0
Installed-Time: $INSTALL_TIME
STEOF

echo "已注册到 opkg (iStore 可管理)"

# 执行 uci-defaults
if [ -f /etc/uci-defaults/99-openclaw ]; then
	echo "执行初始化脚本..."
	( . /etc/uci-defaults/99-openclaw ) && rm -f /etc/uci-defaults/99-openclaw
fi

# 清除 LuCI 缓存
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null
rm -f /tmp/luci-indexcache.*.json 2>/dev/null

# 重启 Web PTY 服务 (使其加载新文件和新 token)
# PTY 是 procd 管理的实例, kill 后 procd 会自动 respawn
PTY_PID=$(pgrep -f 'web-pty.js' 2>/dev/null | head -1)
if [ -n "$PTY_PID" ]; then
	echo "重启配置终端服务..."
	kill "$PTY_PID" 2>/dev/null
	sleep 1
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "后续步骤:"
echo "  1. 运行 openclaw-env setup  — 下载 Node.js 并安装 OpenClaw"
echo "  2. 访问 LuCI → 服务 → OpenClaw 进行配置"
echo "  3. 或执行 /etc/init.d/openclaw enable && /etc/init.d/openclaw start"
echo ""

exit 0
__ARCHIVE_BELOW__
INSTALLER_EOF
}

# 构建
echo ""
echo "[1/4] 安装文件到暂存区..."
install_files "$STAGING/payload"

echo "[2/4] 生成文件列表..."
# 生成安装文件列表 (供 opkg 卸载时使用)
# 注: openclaw.default 安装后会变为 openclaw, 文件列表中记录最终路径
FILE_LIST=$(cd "$STAGING/payload" && find . -type f | sed 's|^\./|/|' | sed 's|/etc/config/openclaw.default|/etc/config/openclaw|' | sort)
echo "  共 $(echo "$FILE_LIST" | wc -l | tr -d ' ') 个文件"

echo "[3/4] 创建安装器..."
create_installer

# 替换安装器中的占位符
sed -i "s|__PKG_VERSION__|${PKG_VERSION}|g" "$STAGING/install.sh"
# 替换文件列表占位符 — 使用临时文件拼接避免 sed/awk 多行问题
{
	sed '/__FILE_LIST__/,$d' "$STAGING/install.sh"
	echo "$FILE_LIST"
	sed '1,/__FILE_LIST__/d' "$STAGING/install.sh"
} > "$STAGING/install_final.sh"
mv "$STAGING/install_final.sh" "$STAGING/install.sh"

echo "[4/4] 打包..."
mkdir -p "$OUT_DIR"

# 创建 payload tarball
(cd "$STAGING/payload" && tar czf "$STAGING/payload.tar.gz" .)

# 组合: installer header + payload
RUN_FILE="$OUT_DIR/${PKG_NAME}_${PKG_VERSION}.run"
cat "$STAGING/install.sh" "$STAGING/payload.tar.gz" > "$RUN_FILE"
chmod +x "$RUN_FILE"

FILE_SIZE=$(wc -c < "$RUN_FILE" | tr -d ' ')
echo ""
echo "=== 构建完成 ==="
echo "输出文件: $RUN_FILE"
echo "文件大小: $FILE_SIZE bytes"
echo ""
echo "安装方法: sh ${PKG_NAME}_${PKG_VERSION}.run"
