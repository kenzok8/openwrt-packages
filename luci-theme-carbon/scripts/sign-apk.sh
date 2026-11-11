#!/bin/sh
# Sign APK v3 files and require verification with the intended public key.
# Usage: sh scripts/sign-apk.sh PRIVATE_KEY PUBLIC_KEY PACKAGE.apk [...]
set -eu

[ "$#" -ge 3 ] || { echo "Usage: $0 PRIVATE_KEY PUBLIC_KEY PACKAGE.apk [...]" >&2; exit 1; }
private_key=$1
public_key=$2
shift 2
[ -s "$private_key" ] && [ -s "$public_key" ] || { echo "Signing key is missing" >&2; exit 1; }
command -v apk >/dev/null 2>&1 || { echo "apk-tools 3 is required" >&2; exit 1; }

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
mkdir "$work/keys"
cp "$public_key" "$work/keys/carbon-apk.pem"

for package in "$@"; do
	[ -s "$package" ] || { echo "APK file is missing: $package" >&2; exit 1; }
	case "$package" in *.apk) ;; *) echo "Expected an .apk file: $package" >&2; exit 1 ;; esac
	# Keep the input intact if signing fails. adbsign alone is not a verification.
	cp "$package" "$work/package.apk"
	# The SDK input is unsigned. This flag is only for reading it while signing;
	# verification and router installation must never use it.
	apk adbsign --allow-untrusted --reset-signatures --sign-key "$private_key" "$work/package.apk"
	apk --keys-dir "$work/keys" --repositories-file /dev/null --no-network verify "$work/package.apk"
	cat "$work/package.apk" > "$package"
	printf 'Signed and verified: %s\n' "$package"
done
