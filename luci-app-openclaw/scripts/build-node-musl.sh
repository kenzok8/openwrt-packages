#!/bin/sh
# ============================================================================
# Node.js ARM64 musl 构建脚本
# 在 Alpine ARM64 Docker 容器内运行
# 
# 环境变量: 
#   NODE_VER (目标版本号)
#   BUILD_MODE (apk|cross) - apk: 使用 Alpine apk, cross: 从官方 glibc 版本交叉编译
#   /output (输出目录)
#
# 打包策略:
#   1. apk 模式: 使用 Alpine apk 安装 nodejs，版本受限于 Alpine 仓库
#   2. cross 模式: 从 Node.js 官方下载 glibc 版本，转换为 musl
#   使用 patchelf 修改 node 二进制的 ELF interpreter 和 rpath，
#   使其直接使用打包的 musl 链接器和共享库，无需 LD_LIBRARY_PATH。
#   这样 process.execPath 返回正确的 node 路径，子进程 fork 也能正常工作。
#   安装路径固定为 /opt/openclaw/node (与 openclaw-env 一致)。
# ============================================================================
set -e

INSTALL_PREFIX="/opt/openclaw/node"
BUILD_MODE="${BUILD_MODE:-apk}"

echo "=== Node.js ARM64 musl Build ==="
echo "  Target version: v${NODE_VER}"
echo "  Build mode: ${BUILD_MODE}"

# ── apk 模式: 使用 Alpine 仓库的 Node.js ──
# PKG_TYPE: lts (nodejs) 或 current (nodejs-current)
build_apk() {
	echo ""
	echo "=== Building with Alpine apk mode ==="
	
	# 根据请求的版本选择包
	if [ "${PKG_TYPE}" = "current" ]; then
		echo "Using nodejs-current package for newer version"
		apk add --no-cache nodejs-current npm xz icu-data-full patchelf
	else
		echo "Using nodejs (LTS) package"
		apk add --no-cache nodejs npm xz icu-data-full patchelf
	fi

	ACTUAL_VER=$(node --version | sed 's/^v//')
	echo "Alpine Node.js version: v${ACTUAL_VER} (requested: v${NODE_VER})"

	# 使用实际版本号作为文件名 (Alpine apk 的 nodejs 版本可能与请求版本不同)
	if [ "$ACTUAL_VER" != "$NODE_VER" ]; then
		echo "WARNING: Actual version (${ACTUAL_VER}) differs from requested (${NODE_VER})"
		echo "         Using actual version for package name"
	fi
	PKG_NAME="node-v${ACTUAL_VER}-linux-arm64-musl"
	PKG_DIR="/tmp/${PKG_NAME}"
	mkdir -p "${PKG_DIR}/bin" "${PKG_DIR}/lib/node_modules" "${PKG_DIR}/include/node"

	# 复制 node 二进制
	cp "$(which node)" "${PKG_DIR}/bin/node"
	chmod +x "${PKG_DIR}/bin/node"

	# 收集 node 依赖的所有共享库 (Alpine node 是动态链接的)
	echo "=== Collecting shared libraries ==="
	LIB_DIR="${PKG_DIR}/lib"
	ldd "$(which node)" 2>/dev/null | while read -r line; do
		lib_path=$(echo "$line" | grep -oE '/[^ ]+\.so[^ ]*' | head -1)
		if [ -n "$lib_path" ] && [ -f "$lib_path" ]; then
			cp -L "$lib_path" "$LIB_DIR/" 2>/dev/null || true
			echo "  + $(basename "$lib_path")"
		fi
	done
	# 确保 musl 动态链接器也在
	if [ -f /lib/ld-musl-aarch64.so.1 ]; then
		cp -L /lib/ld-musl-aarch64.so.1 "$LIB_DIR/" 2>/dev/null || true
		echo "  + ld-musl-aarch64.so.1"
	fi
	echo "Libraries collected: $(ls "$LIB_DIR"/*.so* 2>/dev/null | wc -l) files"

	# 复制 ICU 完整数据
	echo "=== Copying ICU data ==="
	ICU_DAT=$(find /usr/share/icu -name "icudt*.dat" 2>/dev/null | head -1)
	if [ -n "$ICU_DAT" ] && [ -f "$ICU_DAT" ]; then
		mkdir -p "${PKG_DIR}/share/icu"
		cp "$ICU_DAT" "${PKG_DIR}/share/icu/"
		echo "  + $(basename "$ICU_DAT") ($(du -h "$ICU_DAT" | cut -f1))"
	else
		echo "  WARNING: ICU data file not found"
	fi

	# 复制 npm
	if [ -d /usr/lib/node_modules/npm ]; then
		cp -r /usr/lib/node_modules/npm "${PKG_DIR}/lib/node_modules/"
	fi

	# 返回包名供后续使用
	echo "PKG_NAME=${PKG_NAME}" >> /tmp/build_env
	echo "PKG_DIR=${PKG_DIR}" >> /tmp/build_env
}

# ── cross 模式: 从 Node.js 官方 glibc 版本交叉编译 ──
build_cross() {
	echo ""
	echo "=== Building with cross-compilation mode ==="
	apk add --no-cache xz patchelf curl wget ca-certificates

	# 下载 Node.js 官方 ARM64 glibc 版本
	NODE_TARBALL="node-v${NODE_VER}-linux-arm64.tar.xz"
	NODE_URL="https://nodejs.org/dist/v${NODE_VER}/${NODE_TARBALL}"

	echo "=== Downloading Node.js v${NODE_VER} ARM64 glibc ==="
	cd /tmp
	if ! curl -fSL -o "$NODE_TARBALL" "$NODE_URL"; then
		echo "ERROR: Failed to download Node.js from $NODE_URL"
		exit 1
	fi

	# 解压
	echo "=== Extracting Node.js ==="
	rm -rf "node-v${NODE_VER}-linux-arm64" 2>/dev/null || true
	tar xf "$NODE_TARBALL"
	SRC_DIR="node-v${NODE_VER}-linux-arm64"

	# 创建输出目录
	PKG_NAME="node-v${NODE_VER}-linux-arm64-musl"
	PKG_DIR="/tmp/${PKG_NAME}"
	rm -rf "$PKG_DIR" 2>/dev/null || true
	mkdir -p "${PKG_DIR}/bin" "${PKG_DIR}/lib" "${PKG_DIR}/share/icu"

	# 复制 node 二进制
	echo "=== Copying Node.js binary ==="
	cp "${SRC_DIR}/bin/node" "${PKG_DIR}/bin/node"
	chmod +x "${PKG_DIR}/bin/node"

	# 复制 npm
	if [ -d "${SRC_DIR}/lib/node_modules/npm" ]; then
		mkdir -p "${PKG_DIR}/lib/node_modules"
		cp -r "${SRC_DIR}/lib/node_modules/npm" "${PKG_DIR}/lib/node_modules/"
	fi

	# 复制 ICU 数据
	ICU_DAT=$(find "${SRC_DIR}" -name "icudt*.dat" 2>/dev/null | head -1)
	if [ -n "$ICU_DAT" ] && [ -f "$ICU_DAT" ]; then
		cp "$ICU_DAT" "${PKG_DIR}/share/icu/"
		echo "  + ICU data: $(basename "$ICU_DAT")"
	fi

	# ── 关键步骤: musl 库收集 ──
	echo "=== Converting to musl libc ==="

	# 复制 musl 动态链接器
	if [ -f /lib/ld-musl-aarch64.so.1 ]; then
		cp -L /lib/ld-musl-aarch64.so.1 "${PKG_DIR}/lib/"
		echo "  + ld-musl-aarch64.so.1"
	else
		echo "ERROR: musl dynamic linker not found"
		exit 1
	fi

	# 收集 musl 版本的依赖库
	# Node.js 官方 ARM64 版本依赖: libcrypto, libssl, libz, libstdc++, libgcc_s
	# 这些库需要从 Alpine (musl) 版本获取
	echo "=== Collecting musl libraries ==="
	LIB_DIR="${PKG_DIR}/lib"
	
	# 安装必要的库包
	apk add --no-cache libcrypto3 libssl3 zlib libstdc++ libgcc
	
	# 复制库文件
	for lib in libcrypto.so.3 libssl.so.3 libz.so.1 libstdc++.so.6 libgcc_s.so.1; do
		for libpath in /usr/lib/$lib /lib/$lib; do
			if [ -f "$libpath" ]; then
				cp -L "$libpath" "$LIB_DIR/" 2>/dev/null || true
				echo "  + $lib"
				break
			fi
		done
	done

	# 收集所有 musl 库的依赖
	for lib in "$LIB_DIR"/*.so*; do
		[ -f "$lib" ] || continue
		ldd "$lib" 2>/dev/null | while read -r line; do
			lib_path=$(echo "$line" | grep -oE '/[^ ]+\.so[^ ]*' | head -1)
			if [ -n "$lib_path" ] && [ -f "$lib_path" ]; then
				lib_name=$(basename "$lib_path")
				[ -f "$LIB_DIR/$lib_name" ] || cp -L "$lib_path" "$LIB_DIR/" 2>/dev/null || true
			fi
		done
	done

	echo "Libraries collected: $(ls "$LIB_DIR"/*.so* 2>/dev/null | wc -l) files"

	# 返回包名供后续使用
	echo "PKG_NAME=${PKG_NAME}" >> /tmp/build_env
	echo "PKG_DIR=${PKG_DIR}" >> /tmp/build_env
}

# ── 公共步骤: patchelf 和打包 ──
finalize_package() {
	. /tmp/build_env

	# 用 patchelf 修改 node 二进制
	echo "=== Patching ELF binary ==="
	patchelf --set-interpreter "${INSTALL_PREFIX}/lib/ld-musl-aarch64.so.1" "${PKG_DIR}/bin/node"
	patchelf --set-rpath "${INSTALL_PREFIX}/lib" "${PKG_DIR}/bin/node"
	echo "  interpreter: ${INSTALL_PREFIX}/lib/ld-musl-aarch64.so.1"
	echo "  rpath: ${INSTALL_PREFIX}/lib"

	# 创建 node wrapper 脚本
	cat > "${PKG_DIR}/bin/node-wrapper" << 'NODEWRAPPER'
#!/bin/sh
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_ICU_DATA="${SELF_DIR}/../share/icu"
exec "${SELF_DIR}/node" "$@"
NODEWRAPPER
	chmod +x "${PKG_DIR}/bin/node-wrapper"

	# 创建 npm wrapper
	cat > "${PKG_DIR}/bin/npm" << 'NPMWRAPPER'
#!/bin/sh
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_ICU_DATA="${SELF_DIR}/../share/icu"
exec "${SELF_DIR}/node" "${SELF_DIR}/../lib/node_modules/npm/bin/npm-cli.js" "$@"
NPMWRAPPER

	# 创建 npx wrapper
	cat > "${PKG_DIR}/bin/npx" << 'NPXWRAPPER'
#!/bin/sh
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_ICU_DATA="${SELF_DIR}/../share/icu"
exec "${SELF_DIR}/node" "${SELF_DIR}/../lib/node_modules/npm/bin/npx-cli.js" "$@"
NPXWRAPPER
	chmod +x "${PKG_DIR}/bin/npm" "${PKG_DIR}/bin/npx"

	# 验证
	echo "=== Verification ==="
	mkdir -p "${INSTALL_PREFIX}"
	cp -a "${PKG_DIR}"/* "${INSTALL_PREFIX}/"
	
	# 设置库路径并测试
	export LD_LIBRARY_PATH="${INSTALL_PREFIX}/lib"
	
	"${INSTALL_PREFIX}/bin/node" --version
	"${INSTALL_PREFIX}/bin/node" -e "console.log('execPath:', process.execPath)"
	"${INSTALL_PREFIX}/bin/node" -e "console.log(process.arch, process.platform, process.versions.modules)"
	NODE_ICU_DATA="${INSTALL_PREFIX}/share/icu" "${INSTALL_PREFIX}/bin/npm" --version 2>/dev/null || echo "npm needs ICU data"
	
	rm -rf "${INSTALL_PREFIX}"

	# 打包
	echo "=== Creating tarball ==="
	cd /tmp
	tar cJf "/output/${PKG_NAME}.tar.xz" "${PKG_NAME}"
	ls -lh "/output/${PKG_NAME}.tar.xz"
	echo "=== Done: ${PKG_NAME}.tar.xz ==="
}

# ── 主入口 ──
rm -f /tmp/build_env

case "$BUILD_MODE" in
	apk)
		build_apk
		;;
	cross)
		build_cross
		;;
	*)
		echo "ERROR: Unknown BUILD_MODE: $BUILD_MODE"
		exit 1
		;;
esac

finalize_package
