#!/bin/sh
# Compile styles and fingerprint the resources that LuCI loads by module name.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
output=${1:-"$root/htdocs/luci-static/argon"}
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/css"
for sheet in base admin; do
	"${LESSC:-lessc}" "$root/less/$sheet.less" "$tmpdir/css/$sheet.css"
done

digest() { sha256sum "$1" | cut -c1-16; }
"${LESSC:-lessc}" --modify-var="base-version='$(digest "$tmpdir/css/base.css")'" \
	--modify-var="admin-version='$(digest "$tmpdir/css/admin.css")'" \
	"$root/less/cascade.less" "$tmpdir/css/cascade.css"

(
	cd "$root/htdocs/luci-static/resources"
	find . -type f -name '*.js' | LC_ALL=C sort > "$tmpdir/js-files"
	while IFS= read -r file; do
		sha256sum "$file"
	done < "$tmpdir/js-files"
) > "$tmpdir/js-hashes"
digest "$tmpdir/js-hashes" > "$tmpdir/js-version"

mkdir -p "$output/css"
cp "$tmpdir"/css/*.css "$output/css/"
cp "$tmpdir/js-version" "$output/"
