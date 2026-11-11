#!/bin/sh
# Integration test with a real SDK-produced APK. Needs apk-tools 3 + openssl.
# Usage: sh tests/apk-signing.sh path/to/unsigned.apk
set -eu
[ "$#" -eq 1 ] && [ -s "$1" ] || { echo 'Pass an unsigned SDK APK' >&2; exit 1; }
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
umask 077
mkdir "$work/keys" "$work/empty" "$work/wrong"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$work/private.pem"
openssl pkey -in "$work/private.pem" -pubout -out "$work/keys/public.pem"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$work/other.pem"
openssl pkey -in "$work/other.pem" -pubout -out "$work/wrong/public.pem"
cp "$1" "$work/package.apk"

reject() {
	if "$@"; then echo 'FAIL: expected rejection' >&2; exit 1; fi
}
verify() {
	apk --keys-dir "$1" --repositories-file /dev/null --no-network verify "$2"
}

reject verify "$work/keys" "$work/package.apk"
before=$(sha256sum "$work/package.apk")
reject sh "$repo/scripts/sign-apk.sh" "$work/private.pem" "$work/wrong/public.pem" "$work/package.apk"
[ "$before" = "$(sha256sum "$work/package.apk")" ]
reject sh "$repo/scripts/sign-apk.sh" "$work/missing.pem" "$work/keys/public.pem" "$work/package.apk"
sh "$repo/scripts/sign-apk.sh" "$work/private.pem" "$work/keys/public.pem" "$work/package.apk"
verify "$work/keys" "$work/package.apk"
reject verify "$work/empty" "$work/package.apk"
reject verify "$work/wrong" "$work/package.apk"
# Truncating the compressed payload must also be rejected with the correct key.
size=$(wc -c < "$work/package.apk")
dd if="$work/package.apk" of="$work/damaged.apk" bs=1 count="$((size / 2))" 2>/dev/null
reject verify "$work/keys" "$work/damaged.apk"
echo 'PASS: unsigned, missing/mismatched key, untrusted key and damaged payload rejected; signed package verified'
