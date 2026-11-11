#!/bin/sh
#
# Build luci-theme-carbon_<version>_all.ipk without the OpenWrt SDK.
#
# The theme is architecture independent (CSS/JS/templates only), so a
# plain tar-based .ipk works on every OpenWrt 23.05 / 24.10 device that
# uses opkg. For OpenWrt 25.x (apk) build with the SDK and the Makefile.
#
# Usage: sh scripts/build-ipk.sh [output-dir]
#
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/dist"}
PKG=luci-theme-carbon
VER=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT/Makefile")
REL=$(sed -n 's/^PKG_RELEASE:=//p' "$ROOT/Makefile")
FULLVER="$VER-r$REL"
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd)   # absolute: later steps run from a temp dir
IPK="$OUT/${PKG}_${FULLVER}_all.ipk"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/carbon-ipk.XXXXXX")
cleanup() { [ -n "$WORK" ] && [ -d "$WORK" ] && rm -r "$WORK"; }
trap cleanup EXIT INT TERM

DATA="$WORK/data"
CTRL="$WORK/control"
mkdir -p "$DATA/www" "$DATA/usr/share/ucode/luci" "$CTRL" "$OUT"

# --- payload (same layout luci.mk produces) -------------------------------
cp -R "$ROOT/htdocs/." "$DATA/www/"
cp -R "$ROOT/ucode/." "$DATA/usr/share/ucode/luci/"
cp -R "$ROOT/root/." "$DATA/"
chmod 0755 "$DATA/etc/uci-defaults/30_luci-theme-carbon"
chmod 0755 "$DATA/usr/libexec/rpcd/luci.carbon_update"
find "$DATA" -name '.DS_Store' -exec rm {} +

SIZE=$(du -sk "$DATA" | cut -f1)

# --- control files --------------------------------------------------------
cat > "$CTRL/control" <<EOF
Package: $PKG
Version: $FULLVER
Depends: luci-base, curl, ca-bundle, flock
Source: $PKG
SourceName: $PKG
License: Apache-2.0
Section: luci
URL: https://github.com/openwrt/luci
Architecture: all
Installed-Size: $((SIZE * 1024))
Description: Carbon - an Apple-style LuCI theme for everyday users.
 Simple / Pro navigation, chart based dashboard, dark mode, mobile layout.
EOF

cat > "$CTRL/postinst" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
if [ -f /etc/uci-defaults/30_luci-theme-carbon ]; then
	( . /etc/uci-defaults/30_luci-theme-carbon ) && rm -f /etc/uci-defaults/30_luci-theme-carbon
fi
rm -f /tmp/luci-indexcache* 2>/dev/null
rm -rf /tmp/luci-modulecache 2>/dev/null
/etc/init.d/rpcd reload 2>/dev/null
exit 0
EOF

cat > "$CTRL/postrm" <<'EOF'
#!/bin/sh
if [ "${PKG_UPGRADE:-}" = 1 ] || [ "${1:-}" = upgrade ]; then exit 0; fi
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
uci -q delete luci.themes.Carbon
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/carbon" ]; then
	if [ -d /www/luci-static/bootstrap ]; then
		uci set luci.main.mediaurlbase=/luci-static/bootstrap
	else
		uci -q delete luci.main.mediaurlbase
	fi
fi
uci commit luci
rm -f /etc/config/carbon
rm -rf /www/luci-static/carbon/custom
rmdir /www/luci-static/carbon 2>/dev/null
rm -f /tmp/luci-indexcache* 2>/dev/null
/etc/init.d/rpcd reload 2>/dev/null
exit 0
EOF
chmod 0755 "$CTRL/postinst" "$CTRL/postrm"
echo "2.0" > "$WORK/debian-binary"

# --- pack (gzip'd tar of tars, like OpenWrt's ipkg-build) -----------------
if tar --version 2>/dev/null | grep -q 'GNU tar'; then
	TAROPTS="--format=gnu --owner=0 --group=0 --numeric-owner --sort=name"
else
	# bsdtar (macOS): strip resource forks / xattrs, force root ownership
	export COPYFILE_DISABLE=1
	TAROPTS="--format ustar --uid 0 --gid 0 --uname root --gname root --no-xattrs --no-mac-metadata"
fi

# shellcheck disable=SC2086
(cd "$DATA" && tar $TAROPTS -czf "$WORK/data.tar.gz" .)
# shellcheck disable=SC2086
(cd "$CTRL" && tar $TAROPTS -czf "$WORK/control.tar.gz" .)
# shellcheck disable=SC2086
(cd "$WORK" && tar $TAROPTS -czf "$IPK" ./debian-binary ./data.tar.gz ./control.tar.gz)

echo "Built $IPK ($(du -k "$IPK" | cut -f1) KB)"
