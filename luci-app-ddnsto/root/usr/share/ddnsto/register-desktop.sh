#!/bin/sh
# Called by the owning plugin and its metadata migration hook.
set -e
root="${IPKG_INSTROOT:-}"
manifest="/usr/share/ddnsto/ddnsto-plugin.json"
legacy="${root}/usr/share/linkeasefull/desktop-apps.d/16-ddnsto.json"
[ -f "${root}${manifest}" ] || exit 0
# Replace only the exact historical metadata payload; preserve custom entries.
if [ -f "${legacy}" ] && [ ! -L "${legacy}" ] && [ "$(sha256sum "${legacy}" | cut -d ' ' -f 1)" = "a72a8b3e529c91b2a3bc32ef695e5f7dc2935e332fcbd3201f985e05c2c8763d" ]; then
    rm -f "${legacy}"
fi
if [ ! -e "${legacy}" ] && [ ! -L "${legacy}" ]; then
    mkdir -p "${legacy%/*}"
    ln -s "${manifest}" "${legacy}"
fi
