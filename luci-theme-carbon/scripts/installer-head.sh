#!/bin/sh
#
# Carbon theme installer for OpenWrt / ImmortalWrt (LuCI 23.05 and later).
#
#   sh carbon-install.sh               install or upgrade
#   sh carbon-install.sh --trust-key   also trust Carbon's APK key for LuCI package uploads
#   sh carbon-install.sh --files       only copy files (no package record, no online updates)
#   sh carbon-install.sh uninstall     remove the theme
#
# The installer embeds the release's signed .apk, its .ipk and Carbon's public
# key, and installs through the system package manager (apk or opkg), so
# System → Carbon Theme Settings can update the theme later. The APK signature
# is verified with the embedded key in a private key directory: /etc/apk/keys
# and signature checks stay untouched unless --trust-key is given. Missing
# dependencies come from the firmware's own package feeds. If a native install
# is impossible (e.g. offline without dependencies), the theme files are copied
# instead and online updates stay disabled.
#
set -e

VERSION="@VERSION@"
PKG=luci-theme-carbon
ROOT="${CARBON_ROOT:-}"                             # tests only: alternate root with stub tools on PATH
DEPS="${CARBON_DEPS-luci-base curl ca-bundle flock}"   # tests only: override the dependency list
# Files written by the --files mode (and by installers before v1.1.3).
FILE_PATHS="
/www/luci-static/carbon
/www/luci-static/resources/menu-carbon.js
/www/luci-static/resources/carbon
/www/luci-static/resources/view/system/carbon-update.js
/usr/share/ucode/luci/template/themes/carbon
/usr/share/rpcd/acl.d/luci-theme-carbon.json
/usr/share/rpcd/acl.d/luci-theme-carbon-update.json
/usr/share/luci/menu.d/luci-theme-carbon.json
/usr/share/carbon
/usr/libexec/rpcd/luci.carbon_update
/lib/upgrade/keep.d/luci-theme-carbon
"
# User data under the theme directory: the custom logo. Kept when a script-only
# install becomes a package; removed on uninstall.
CUSTOM_DIR=/www/luci-static/carbon/custom

say() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
	say "Usage: sh $0 [install|uninstall] [--trust-key] [--files]"
	say "  install      install or upgrade Carbon $VERSION through apk/opkg (default)"
	say "  --trust-key  also add Carbon's public key to /etc/apk/keys for LuCI uploads"
	say "  --files      copy files only; online updates are not available"
	say "  uninstall    remove the theme"
}

WORK=''
cleanup() { [ -z "$WORK" ] || rm -rf "$WORK"; }
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

unpack() {
	line=$(awk '/^__CARBON_PAYLOAD__$/ { print NR + 1; exit 0 }' "$0")
	[ -n "$line" ] || die "embedded payload not found (file damaged? run it as: sh carbon-install.sh)"
	WORK=$(mktemp -d "${TMPDIR:-/tmp}/carbon-install.XXXXXX") || die "cannot create a temporary directory"
	tail -n +"$line" "$0" | tar -xzf - -C "$WORK" || die "failed to unpack the installer (file damaged?)"
}

have_uci() { command -v uci >/dev/null 2>&1; }

refresh_luci() {
	[ -n "$ROOT" ] && return 0
	rm -f /tmp/luci-indexcache* 2>/dev/null || true
	rm -rf /tmp/luci-modulecache 2>/dev/null || true
	[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
}

manager() {
	if command -v apk >/dev/null 2>&1 && [ -f "$ROOT/etc/apk/world" ]; then echo apk
	elif command -v opkg >/dev/null 2>&1; then echo opkg
	fi
}

# Installed version of a package, empty when it is not registered.
pkg_version() {
	case "$1" in
		apk) apk list --installed "$2" 2>/dev/null | sed -n "s/^$2-\([0-9][^ ]*\) .*/\1/p" | head -n 1 ;;
		opkg) opkg status "$2" 2>/dev/null | awk '/^Version: / {v=$2} /^Status: .* installed$/ {ok=1} END {if (ok) print v}' ;;
	esac
}

# Prints <, = or > comparing version $2 with $3.
version_cmp() {
	case "$1" in
		apk) apk version -t "$2" "$3" 2>/dev/null ;;
		opkg)
			if opkg compare-versions "$2" '<<' "$3"; then echo '<'
			elif opkg compare-versions "$2" '=' "$3"; then echo '='
			else echo '>'; fi ;;
	esac
}

remove_files() {
	for p in $FILE_PATHS; do
		if [ "$p" = /www/luci-static/carbon ] && [ "${1:-}" != all ] && [ -d "${ROOT}${CUSTOM_DIR}" ]; then
			find "${ROOT}${p}" -mindepth 1 -maxdepth 1 ! -name custom -exec rm -rf {} \;
		else
			rm -rf "${ROOT}${p}"
		fi
	done
}

install_files() {
	say "Copying theme files ..."
	mkdir -p "$ROOT/"
	cp -a "$WORK/files/." "$ROOT/" || die "failed to copy theme files"
}

# Native install through apk/opkg. Returns non-zero when the caller should
# fall back to copying files; exits on a signature failure.
install_native() {
	mgr=$1
	case "$mgr" in
		apk) ext=apk ;;
		opkg) ext=ipk ;;
		*) warn "neither apk nor opkg was found"; return 1 ;;
	esac
	pkg="$WORK/pkg/$PKG.$ext"
	[ -s "$pkg" ] || { warn "this installer contains no .$ext package for $mgr"; return 1; }
	target=$(cat "$WORK/pkg/$mgr.version")
	current=$(pkg_version "$mgr" "$PKG")
	reinstall=0
	if [ -n "$current" ]; then
		case "$(version_cmp "$mgr" "$target" "$current")" in
			'<') say "Carbon $current is newer than this installer ($target); keeping it."; return 0 ;;
			'=') reinstall=1 ;;
		esac
	fi

	if [ "$mgr" = apk ]; then
		mkdir -p "$WORK/keys"
		cp "$WORK/pkg/carbon-apk.pem" "$WORK/keys/carbon-apk.pem"
		apk --keys-dir "$WORK/keys" --repositories-file /dev/null --no-network verify "$pkg" >/dev/null 2>&1 ||
			die "APK signature verification failed. Nothing was installed; download carbon-install.sh again."
	fi

	missing=''
	for dep in $DEPS; do
		[ -n "$(pkg_version "$mgr" "$dep")" ] || missing="$missing $dep"
	done
	if [ -n "$missing" ]; then
		say "Installing dependencies from the firmware feeds:$missing"
		case "$mgr" in
			apk) apk update >/dev/null 2>&1 || true; apk add $missing ;;
			opkg) opkg update >/dev/null 2>&1 || true; opkg install $missing ;;
		esac || { warn "could not install$missing (check internet access and the package feeds)"; return 1; }
	fi

	# Files from a script-only install are owned by no package; let the package own them.
	[ -n "$current" ] || remove_files

	say "Installing $PKG $target with $mgr ..."
	case "$mgr" in
		apk) apk --keys-dir "$WORK/keys" --repositories-file /dev/null --no-network add "$pkg" ;;
		opkg)
			if [ "$reinstall" = 1 ]; then opkg install --force-reinstall "$pkg"
			else opkg install "$pkg"; fi ;;
	esac || { warn "$mgr could not install $PKG"; return 1; }

	[ "$(pkg_version "$mgr" "$PKG")" = "$target" ] || { warn "$mgr does not report $PKG $target as installed"; return 1; }
	return 0
}

trust_key() {
	[ "$1" = apk ] || { warn "--trust-key only applies to apk based firmware"; return 0; }
	mkdir -p "$ROOT/etc/apk/keys"
	cp "$WORK/pkg/carbon-apk.pem" "$ROOT/etc/apk/keys/carbon-apk.pem"
	chmod 644 "$ROOT/etc/apk/keys/carbon-apk.pem"
	say "Trusted Carbon's APK key for LuCI package uploads: /etc/apk/keys/carbon-apk.pem"
}

activate() {
	have_uci || return 0
	{
		uci set luci.themes.Carbon=/luci-static/carbon &&
		uci set luci.main.mediaurlbase=/luci-static/carbon &&
		uci commit luci
	} || warn "could not select the Carbon theme; choose it in System → System → Language and Style"
}

do_install() {
	if [ -z "$ROOT" ]; then
		[ "$(id -u)" = 0 ] || die "please run as root"
	fi
	[ -f "$ROOT/usr/share/ucode/luci/template/header.ut" ] || \
		die "LuCI with ucode templates (OpenWrt 23.05 or later) is required"

	unpack
	say "Installing Carbon theme $VERSION ..."
	mgr=$(manager)
	native=0
	if [ "$FILES_ONLY" != 1 ]; then
		if install_native "$mgr"; then
			native=1
		elif [ -n "$mgr" ] && [ -n "$(pkg_version "$mgr" "$PKG")" ]; then
			# Never copy files over a registered package; the installed version keeps working.
			die "the upgrade failed; Carbon $(pkg_version "$mgr" "$PKG") remains installed. See the messages above."
		else
			warn "falling back to copying files. The theme works, but online updates stay"
			warn "disabled until Carbon is installed with apk/opkg (run this installer again later)."
		fi
	elif [ -n "$mgr" ] && [ -n "$(pkg_version "$mgr" "$PKG")" ]; then
		die "Carbon is installed with $mgr; upgrade it without --files"
	fi
	[ "$native" = 1 ] || install_files
	[ "$TRUST_KEY" != 1 ] || [ -z "$mgr" ] || trust_key "$mgr"
	activate
	refresh_luci

	say ""
	if [ "$native" = 1 ]; then
		say "Done. Carbon is installed with $mgr and is now the active theme."
		say "Online updates: System → Carbon Theme Settings."
	else
		say "Done. Carbon files were copied and Carbon is now the active theme."
	fi
	say "Refresh the LuCI page, then log out and back in once so the"
	say "dashboard and updater permissions take effect."
}

do_uninstall() {
	say "Removing Carbon theme ..."
	mgr=$(manager)
	current=''
	[ -z "$mgr" ] || current=$(pkg_version "$mgr" "$PKG")
	if [ -n "$current" ]; then
		say "Removing $PKG $current with $mgr ..."
		case "$mgr" in
			apk) apk del "$PKG" ;;
			opkg) opkg remove "$PKG" ;;
		esac || die "$mgr could not remove $PKG"
	fi
	remove_files all
	rm -rf "${ROOT}${CUSTOM_DIR}"
	rm -f "$ROOT/etc/config/carbon"

	if have_uci; then
		uci -q delete luci.themes.Carbon || true
		if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/carbon" ]; then
			fallback=""
			for t in bootstrap argon material openwrt-2020; do
				if [ -d "$ROOT/www/luci-static/$t" ]; then fallback="/luci-static/$t"; break; fi
			done
			if [ -n "$fallback" ]; then
				uci set luci.main.mediaurlbase="$fallback"
			else
				uci -q delete luci.main.mediaurlbase || true
			fi
		fi
		uci commit luci || true
	fi

	refresh_luci
	[ ! -f "$ROOT/etc/apk/keys/carbon-apk.pem" ] || say "Carbon's APK key stays trusted; remove /etc/apk/keys/carbon-apk.pem to revoke it."
	say "Done. Refresh the LuCI page."
}

ACTION=install
FILES_ONLY=0
TRUST_KEY=0
for arg in "$@"; do
	case "$arg" in
		install|upgrade) ACTION=install ;;
		uninstall|remove) ACTION=uninstall ;;
		--files) FILES_ONLY=1 ;;
		--trust-key) TRUST_KEY=1 ;;
		-h|--help) usage; exit 0 ;;
		*) usage; exit 1 ;;
	esac
done

case "$ACTION" in
	install) do_install ;;
	uninstall) do_uninstall ;;
esac

exit 0
