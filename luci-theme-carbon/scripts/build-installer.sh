#!/bin/sh
#
# Build carbon-install.sh — a single self-extracting installer for opkg and
# apk based OpenWrt / ImmortalWrt (LuCI 23.05+).
#
# Usage: sh scripts/build-installer.sh [output-dir] [--ipk FILE] [--apk FILE] [--key FILE]
#   --ipk  .ipk to embed for opkg (default: built with scripts/build-ipk.sh)
#   --apk  signed .apk to embed for apk systems (release builds). Without it,
#          apk systems fall back to copying files (no online updates).
#   --key  public key that verifies --apk (default: keys/carbon-apk.pem)
#
# The --files payload is taken from the .ipk, so both install modes ship
# exactly the same theme files.
#
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=''
IPK=''
APK=''
KEY="$ROOT/keys/carbon-apk.pem"
die() { echo "build-installer: $*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
	case "$1" in
		--ipk) [ "$#" -ge 2 ] || die "--ipk needs a file"; IPK=$2; shift 2 ;;
		--apk) [ "$#" -ge 2 ] || die "--apk needs a file"; APK=$2; shift 2 ;;
		--key) [ "$#" -ge 2 ] || die "--key needs a file"; KEY=$2; shift 2 ;;
		-*) die "unknown option $1" ;;
		*) OUT=$1; shift ;;
	esac
done
OUT=${OUT:-"$ROOT/dist"}
VER=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT/Makefile")
REL=$(sed -n 's/^PKG_RELEASE:=//p' "$ROOT/Makefile")
FULLVER="$VER-r$REL"
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd)   # absolute: later steps run from a temp dir
TARGET="$OUT/carbon-install.sh"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/carbon-inst.XXXXXX")
cleanup() { [ -n "$WORK" ] && [ -d "$WORK" ] && rm -r "$WORK"; }
trap cleanup EXIT INT TERM

PAYLOAD="$WORK/payload"
mkdir -p "$PAYLOAD/pkg" "$PAYLOAD/files"

if [ -z "$IPK" ]; then
	sh "$ROOT/scripts/build-ipk.sh" "$WORK/ipk" >/dev/null
	IPK=$(ls "$WORK"/ipk/*.ipk)
fi
[ -s "$IPK" ] || die "missing .ipk: $IPK"
[ -s "$KEY" ] || die "missing public key: $KEY"

ipk_version=$(tar -xzOf "$IPK" ./control.tar.gz | tar -xzOf - ./control | sed -n 's/^Version: //p')
[ -n "$ipk_version" ] || die "cannot read the .ipk version"
[ "$ipk_version" = "$FULLVER" ] || echo "build-installer: note: .ipk is $ipk_version, Makefile is $FULLVER" >&2
cp "$IPK" "$PAYLOAD/pkg/luci-theme-carbon.ipk"
printf '%s\n' "$ipk_version" > "$PAYLOAD/pkg/opkg.version"
tar -xzOf "$IPK" ./data.tar.gz | tar -xzf - -C "$PAYLOAD/files" ./www ./usr

if [ -n "$APK" ]; then
	[ -s "$APK" ] || die "missing .apk: $APK"
	apk_version=$(basename "$APK" | sed -n 's/^luci-theme-carbon-\([0-9][^/]*-r[0-9]*\)\.apk$/\1/p')
	[ -n "$apk_version" ] || die "expected luci-theme-carbon-VERSION-rN.apk, got $(basename "$APK")"
	cp "$APK" "$PAYLOAD/pkg/luci-theme-carbon.apk"
	printf '%s\n' "$apk_version" > "$PAYLOAD/pkg/apk.version"
else
	echo "build-installer: no --apk given; apk systems will fall back to copying files" >&2
fi
cp "$KEY" "$PAYLOAD/pkg/carbon-apk.pem"

if tar --version 2>/dev/null | grep -q 'GNU tar'; then
	TAROPTS="--format=ustar --owner=0 --group=0 --numeric-owner"
else
	export COPYFILE_DISABLE=1
	TAROPTS="--format ustar --uid 0 --gid 0 --uname root --gname root --no-xattrs --no-mac-metadata"
fi

# shellcheck disable=SC2086
(cd "$PAYLOAD" && tar $TAROPTS -czf "$WORK/payload.tar.gz" ./pkg ./files)

sed "s/@VERSION@/$FULLVER/" "$ROOT/scripts/installer-head.sh" > "$TARGET"
printf '__CARBON_PAYLOAD__\n' >> "$TARGET"
cat "$WORK/payload.tar.gz" >> "$TARGET"
chmod 0755 "$TARGET"

echo "Built $TARGET ($(du -k "$TARGET" | cut -f1) KB; ipk $ipk_version${APK:+, apk $apk_version})"
