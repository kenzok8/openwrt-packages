#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VERSION='1.0.0-r1'
OUTDIR="${1:-$ROOT/dist}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

mkdir -p "$WORK/control" "$WORK/data/www/luci-static/resources" "$OUTDIR"
cp -R "$ROOT/htdocs/luci-static/resources/." "$WORK/data/www/luci-static/resources/"
cp -R "$ROOT/root/." "$WORK/data/"
chmod 0755 "$WORK/data/etc/init.d/device-gateway"
chmod 0755 "$WORK/data/usr/libexec/device-gateway-sync"

cat > "$WORK/control/control" <<EOF
Package: luci-app-device-gateway
Version: $VERSION
Architecture: all
Maintainer: huladabang
Depends: luci-base
Section: luci
Priority: optional
Description: Per-device static IPv4, gateway and DNS settings for dnsmasq
EOF

cat > "$WORK/control/conffiles" <<'EOF'
/etc/config/device-gateway
EOF

cat > "$WORK/control/postinst" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
rm -f /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache/
/etc/init.d/device-gateway enable >/dev/null 2>&1 || true
/usr/libexec/device-gateway-sync --migrate || exit 1
/etc/init.d/device-gateway start || exit 1
/etc/init.d/rpcd reload >/dev/null 2>&1 || true
exit 0
EOF

cat > "$WORK/control/prerm" <<'EOF'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
[ "${1:-}" = 'upgrade' ] && exit 0
[ ! -x /etc/init.d/device-gateway ] || /etc/init.d/device-gateway stop || exit 1
exit 0
EOF
chmod 0755 "$WORK/control/postinst" "$WORK/control/prerm"

printf '2.0\n' > "$WORK/debian-binary"

(cd "$WORK/control" && COPYFILE_DISABLE=1 tar --format=ustar \
	--uid 0 --gid 0 --uname root --gname root -czf "$WORK/control.tar.gz" .)
(cd "$WORK/data" && COPYFILE_DISABLE=1 tar --format=ustar \
	--uid 0 --gid 0 --uname root --gname root -czf "$WORK/data.tar.gz" .)

PKG="$OUTDIR/luci-app-device-gateway_${VERSION}_all.ipk"
rm -f "$PKG"

# OpenWrt 24.10 uses the ipkg tar-stream format: a gzip-compressed outer tar
# containing these three members. This is the format accepted by its opkg.
COPYFILE_DISABLE=1 tar --format=ustar \
	--uid 0 --gid 0 --uname root --gname root -czf "$PKG" -C "$WORK" \
	./debian-binary ./data.tar.gz ./control.tar.gz
printf '%s\n' "$PKG"

