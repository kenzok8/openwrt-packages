#!/bin/sh
#
# Assemble the GitHub release body.
#
#   sh scripts/release-notes.sh TAG [owner/repo] > notes.md
#
# docs/releases/TAG.md and docs/releases/install.md are each written in two
# sections, "## English" and "## 简体中文". The body is every language once,
# start to finish:
#
#   ## English     (TAG.md English section, then install.md English section)
#   ---
#   ## 简体中文     (TAG.md 简体中文 section, then install.md 简体中文 section)
#
# Release notes from before v1.2 (no "## English" heading) are printed
# unchanged above both sections. RELEASE_NOTES_DIR overrides docs/releases.
#
set -eu

TAG=${1:?usage: sh scripts/release-notes.sh TAG [owner/repo]}
REPO=${2:-mrjoechen/luci-theme-carbon}
DIR=${RELEASE_NOTES_DIR:-$(cd "$(dirname "$0")/.." && pwd)/docs/releases}
NOTES="$DIR/$TAG.md"
INSTALL="$DIR/install.md"
EN='English'
ZH='简体中文'

printf '%s\n' "$REPO" | grep -Eq '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' || { echo "invalid repository: $REPO" >&2; exit 1; }
printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || { echo "invalid tag: $TAG" >&2; exit 1; }

has_section() { grep -qx "## $2" "$1"; }
# Body of "## NAME" up to the next "## " heading, without surrounding blank lines.
section() {
	awk -v want="## $2" '
		/^## / { on = ($0 == want); next }
		on { lines[++n] = $0 }
		END {
			first = 1; while (first <= n && lines[first] == "") first++
			last = n; while (last >= first && lines[last] == "") last--
			for (i = first; i <= last; i++) print lines[i]
		}' "$1"
}

for lang in "$EN" "$ZH"; do
	has_section "$INSTALL" "$lang" || { echo "$INSTALL: missing section ## $lang" >&2; exit 1; }
done

notes_lang=0
if [ -f "$NOTES" ] && has_section "$NOTES" "$EN"; then
	has_section "$NOTES" "$ZH" || { echo "$NOTES: missing section ## $ZH" >&2; exit 1; }
	notes_lang=1
elif [ -f "$NOTES" ]; then
	cat "$NOTES"
	printf '\n---\n\n'
fi

for lang in "$EN" "$ZH"; do
	[ "$lang" = "$EN" ] || printf '\n---\n\n'
	printf '## %s\n\n' "$lang"
	if [ "$notes_lang" = 1 ]; then
		section "$NOTES" "$lang"
		printf '\n'
	fi
	section "$INSTALL" "$lang" | sed "s#@REPOSITORY@#$REPO#g"
done
