# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for ddnsto
LUCI_DEPENDS:=+ddnsto +block-mount
LUCI_PKGARCH:=all
PKG_VERSION:=4.2.2-r2
PKG_RELEASE:=

define Package/luci-app-ddnsto/postinst
#!/bin/sh
# Retire only this package-owned legacy registration.
root="$${IPKG_INSTROOT:-}"
legacy="$${root}/usr/share/linkeasefull/desktop-apps.d/16-ddnsto.json"
if [ "$$(readlink "$${legacy}" 2>/dev/null)" = "/usr/share/ddnsto/ddnsto-plugin.json" ]; then
	rm -f "$${legacy}"
fi
if [ -f "$${legacy}" ] && [ ! -L "$${legacy}" ] && [ "$$(sha256sum "$${legacy}" | cut -d " " -f 1)" = "a72a8b3e529c91b2a3bc32ef695e5f7dc2935e332fcbd3201f985e05c2c8763d" ]; then
	rm -f "$${legacy}"
fi
rmdir "$${root}/usr/share/linkeasefull/desktop-apps.d" 2>/dev/null || true
icon="$${root}/usr/share/linkeasefull/app-meta/ddnsto/logo.png"
if [ "$$(readlink "$${icon}" 2>/dev/null)" = "/www/luci-static/resources/app-icons/ddnsto.png" ]; then
 rm -f "$${icon}"
fi
rmdir "$${root}/usr/share/linkeasefull/app-meta/ddnsto" "$${root}/usr/share/linkeasefull/app-meta" 2>/dev/null || true
if [ -z "$${IPKG_INSTROOT}" ]; then
 rm -f /tmp/luci-indexcache /tmp/luci-indexcache.*
 rm -rf /tmp/luci-modulecache/
fi
exit 0
endef

define Package/luci-app-ddnsto/prerm
#!/bin/sh
root="$${IPKG_INSTROOT:-}"
registration="$${root}/usr/share/linkease/apps.d/16-ddnsto.json"
if [ "$$(readlink "$${registration}" 2>/dev/null)" = "/usr/share/ddnsto/ddnsto-plugin.json" ]; then
 rm -f "$${registration}"
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

