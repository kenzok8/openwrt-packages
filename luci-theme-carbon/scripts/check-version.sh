#!/bin/sh
# The Makefile is the single version source. root/usr/share/carbon/version is
# its packaged copy; the theme header and carbon.js read it at runtime.
set -eu
cd "$(dirname "$0")/.."
ver="$(sed -n 's/^PKG_VERSION:=//p' Makefile)-r$(sed -n 's/^PKG_RELEASE:=//p' Makefile)"
if [ "$(cat root/usr/share/carbon/version)" != "$ver" ]; then
	echo "root/usr/share/carbon/version must contain $ver" >&2
	exit 1
fi
if grep -rnE '\?v=[0-9]|C\.version *= *.[0-9]' ucode htdocs; then
	echo "Hard-coded theme version found; read it from /usr/share/carbon/version instead" >&2
	exit 1
fi
echo "version $ver"
