#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
failures=0

check() {
	desc="$1"
	shift
	if "$@"; then
		printf 'ok - %s\n' "$desc"
	else
		printf 'not ok - %s\n' "$desc"
		failures=$((failures + 1))
	fi
}

contains() {
	file="$1"
	pattern="$2"
	grep -q -- "$pattern" "$ROOT/$file"
}

not_contains() {
	file="$1"
	pattern="$2"
	! grep -q -- "$pattern" "$ROOT/$file"
}

not_matches() {
	file="$1"
	pattern="$2"
	! grep -Eq -- "$pattern" "$ROOT/$file"
}

check "default config selects remote mode" \
	contains root/etc/config/openclaw "option mode 'remote'"

check "LuCI exposes mode selection" \
	contains htdocs/luci-static/resources/view/openclaw.js "oc-f-mode"

check "LuCI exposes remote gateway URL" \
	contains htdocs/luci-static/resources/view/openclaw.js "oc-f-remote-url"

check "LuCI uses bundled OpenClaw icon" \
	contains htdocs/luci-static/resources/view/openclaw.js "icon_64.png"

check "LuCI icon asset exists" \
	test -f "$ROOT/htdocs/luci-static/openclaw/icon_64.png"

check "standalone package installs icon asset" \
	contains Makefile "luci-static/openclaw/icon_64.png"

check "remote mode controls show feedback instead of disabled buttons" \
	contains htdocs/luci-static/resources/view/openclaw.js "当前是远端 Gateway 模式"

check "LuCI labels source install as advanced" \
	contains htdocs/luci-static/resources/view/openclaw.js "源码安装"

check "helper exposes source setup preflight" \
	contains root/usr/share/openclaw/luci-helper "preflight_setup"

check "helper blocks low-memory source setup" \
	contains root/usr/share/openclaw/luci-helper "内存不足"

check "setup no longer auto-enables package" \
	not_matches root/usr/share/openclaw/luci-helper "uci set openclaw\\.main\\.enabled=['\\\"]?1"

check "setup no longer enables init script" \
	not_contains root/usr/share/openclaw/luci-helper "/etc/init.d/openclaw enable"

check "init script gates local service by mode" \
	contains root/etc/init.d/openclaw "source|local"

check "gateway no longer exports heap limit to children" \
	not_contains root/etc/init.d/openclaw "NODE_OPTIONS=--max-old-space-size"

if [ "$failures" -ne 0 ]; then
	printf '%s checks failed\n' "$failures" >&2
	exit 1
fi
