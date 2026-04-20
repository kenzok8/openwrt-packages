#!/bin/bash
set -e

PKG_NAME="luci-theme-glass"
PKG_VERSION="$(tr -d '[:space:]' < "$(dirname "$0")/ucode/template/themes/glass/version")"
PKG_RELEASE="1"
MAINTAINER="Ryan Chen <rchen14b@gmail.com>"
DESCRIPTION="Glass - Apple-inspired glassmorphism theme for LuCI"
HOMEPAGE="https://github.com/rchen14b/luci-theme-glass"
LICENSE="GPL-3.0"

DIST_DIR="dist"
WORK_DIR=$(mktemp -d)

# Use GNU tar (gtar) on macOS, fall back to tar
TAR=$(command -v gtar 2>/dev/null || echo tar)

trap "rm -rf $WORK_DIR" EXIT

echo "==> Preparing file tree..."

DATA_DIR="$WORK_DIR/data"
mkdir -p "$DATA_DIR/www/luci-static/glass"
mkdir -p "$DATA_DIR/www/luci-static/resources"
mkdir -p "$DATA_DIR/www/luci-static/resources/view/system"
mkdir -p "$DATA_DIR/usr/share/ucode/luci/template/themes/glass"
mkdir -p "$DATA_DIR/usr/share/rpcd/acl.d"
mkdir -p "$DATA_DIR/usr/share/luci/menu.d"
mkdir -p "$DATA_DIR/etc/uci-defaults"
mkdir -p "$DATA_DIR/etc/config"
mkdir -p "$DATA_DIR/etc/opkg/keys"
mkdir -p "$DATA_DIR/etc/apk/keys"

cp -r htdocs/luci-static/glass/css "$DATA_DIR/www/luci-static/glass/"
cp -r htdocs/luci-static/glass/img "$DATA_DIR/www/luci-static/glass/"
mkdir -p "$DATA_DIR/www/luci-static/glass/background"
cp htdocs/luci-static/resources/menu-glass.js "$DATA_DIR/www/luci-static/resources/"
cp htdocs/luci-static/resources/status-glass.js "$DATA_DIR/www/luci-static/resources/"
cp htdocs/luci-static/resources/view/system/glass.js "$DATA_DIR/www/luci-static/resources/view/system/"
cp ucode/template/themes/glass/*.ut "$DATA_DIR/usr/share/ucode/luci/template/themes/glass/"
cp ucode/template/themes/glass/version "$DATA_DIR/usr/share/ucode/luci/template/themes/glass/"
cp root/usr/share/rpcd/acl.d/luci-theme-glass.json "$DATA_DIR/usr/share/rpcd/acl.d/"
cp root/usr/share/luci/menu.d/luci-theme-glass.json "$DATA_DIR/usr/share/luci/menu.d/"
cp root/etc/uci-defaults/30_luci-theme-glass "$DATA_DIR/etc/uci-defaults/"
cp root/etc/config/glass "$DATA_DIR/etc/config/"
cp root/etc/opkg/keys/* "$DATA_DIR/etc/opkg/keys/" 2>/dev/null || true
cp root/etc/apk/keys/* "$DATA_DIR/etc/apk/keys/" 2>/dev/null || true

INSTALLED_SIZE=$(du -sk "$DATA_DIR" | cut -f1)
INSTALLED_BYTES=$((INSTALLED_SIZE * 1024))
BUILD_DATE=$(date +%s)

mkdir -p "$DIST_DIR"

# ============================================================
# Build IPK (opkg — OpenWrt 24.10 and earlier)
# ============================================================
echo "==> Building IPK..."

IPK_DIR="$WORK_DIR/ipk"
mkdir -p "$IPK_DIR/control"

cat > "$IPK_DIR/control/control" <<EOF
Package: $PKG_NAME
Version: ${PKG_VERSION}-${PKG_RELEASE}
Architecture: all
Maintainer: $MAINTAINER
Section: luci
Priority: optional
Installed-Size: $INSTALLED_SIZE
Description: $DESCRIPTION
Homepage: $HOMEPAGE
License: $LICENSE
EOF

cat > "$IPK_DIR/control/postinst" <<'SCRIPT'
#!/bin/sh
if [ "$PKG_UPGRADE" != 1 ]; then
	uci get luci.themes.Glass >/dev/null 2>&1 || \
	uci batch <<-EOF
		set luci.themes.Glass=/luci-static/glass
		set luci.main.mediaurlbase=/luci-static/glass
		commit luci
	EOF
fi
exit 0
SCRIPT
chmod 755 "$IPK_DIR/control/postinst"

echo "2.0" > "$IPK_DIR/debian-binary"

(cd "$DATA_DIR" && $TAR --format=gnu --numeric-owner --owner=0 --group=0 -cf - . | gzip -n > "$IPK_DIR/data.tar.gz")
(cd "$IPK_DIR/control" && $TAR --format=gnu --numeric-owner --owner=0 --group=0 -cf - . | gzip -n > "$IPK_DIR/control.tar.gz")
(cd "$IPK_DIR" && $TAR --format=gnu --numeric-owner --owner=0 --group=0 -cf - ./debian-binary ./data.tar.gz ./control.tar.gz | gzip -n > "$OLDPWD/$DIST_DIR/${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_all.ipk")

echo "    -> $DIST_DIR/${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_all.ipk"

# ============================================================
# Build APK (apk-tools v3 ADB format — OpenWrt 25.12+)
# Requires Docker (uses Alpine container with apk mkpkg)
# ============================================================
echo "==> Building APK..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK_FILENAME="${PKG_NAME}-${PKG_VERSION}-r${PKG_RELEASE}.apk"

if ! command -v docker &>/dev/null; then
  echo "    [SKIP] Docker not found — APK build requires Docker with Alpine"
  echo "    IPK package was built successfully."
else
  # Prepare post-install script for APK
  APK_SCRIPT="$WORK_DIR/post-install.sh"
  cat > "$APK_SCRIPT" <<'SCRIPT'
#!/bin/sh
uci get luci.themes.Glass >/dev/null 2>&1 || \
uci batch <<-EOF
	set luci.themes.Glass=/luci-static/glass
	set luci.main.mediaurlbase=/luci-static/glass
	commit luci
EOF
exit 0
SCRIPT
  chmod 755 "$APK_SCRIPT"

  # Build using Alpine container with apk mkpkg
  docker run --rm \
    -v "$DATA_DIR:/pkg/files:ro" \
    -v "$APK_SCRIPT:/pkg/post-install.sh:ro" \
    -v "$SCRIPT_DIR/$DIST_DIR:/pkg/out" \
    alpine:latest sh -c "
      apk add --no-cache apk-tools-mkpkg >/dev/null 2>&1 || true
      apk mkpkg \
        --info 'name:$PKG_NAME' \
        --info 'version:${PKG_VERSION}-r${PKG_RELEASE}' \
        --info 'description:$DESCRIPTION' \
        --info 'arch:noarch' \
        --info 'license:$LICENSE' \
        --info 'origin:$PKG_NAME' \
        --info 'url:$HOMEPAGE' \
        --info 'maintainer:$MAINTAINER' \
        --script 'post-install:/pkg/post-install.sh' \
        --files /pkg/files \
        --output /pkg/out/$APK_FILENAME
    " 2>&1

  echo "    -> $DIST_DIR/$APK_FILENAME"
fi

echo ""
echo "==> Done! Packages in $DIST_DIR/"
ls -lh "$DIST_DIR/"
