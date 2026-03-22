# Copyright (C) 2018-2024 OpenWrt luci-app-adguardhome contributors
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-adguardhome
PKG_MAINTAINER:=kenzok8 <https://github.com/kenzok78>
PKG_VERSION:=1.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI app for AdGuardHome
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+ca-certs +curl +wget-ssl +PACKAGE_$(PKG_NAME)_INCLUDE_binary:adguardhome
LUCI_DESCRIPTION:=LuCI support for AdGuardHome

define Package/$(PKG_NAME)/config
config PACKAGE_$(PKG_NAME)_INCLUDE_binary
	bool "Include Binary File"
	default y
endef

PKG_CONFIG_DEPENDS:= CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_binary

define Package/luci-app-adguardhome/conffiles
/usr/share/AdGuardHome/links.txt
/etc/config/AdGuardHome
endef

define Package/luci-app-adguardhome/postinst
#!/bin/sh
	/etc/init.d/AdGuardHome enable >/dev/null 2>&1
	enable="$(uci get AdGuardHome.AdGuardHome.enabled 2>/dev/null)"
	[ "$enable" = "1" ] && /etc/init.d/AdGuardHome reload >/dev/null 2>&1
	rm -f /tmp/luci-indexcache
	rm -f /tmp/luci-modulecache/* 2>/dev/null
exit 0
endef

define Package/luci-app-adguardhome/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/AdGuardHome disable >/dev/null 2>&1
	/etc/init.d/AdGuardHome stop >/dev/null 2>&1
	ucitrack_del() {
		local name="$1"
		local track="$(uci show ucitrack 2>/dev/null | grep -F "$name\." | head -1)"
		[ -n "$track" ] && uci -q del "$track" 2>/dev/null
	}
	ucitrack_del "AdGuardHome"
	[ -n "$(uci show ucitrack 2>/dev/null | grep -c 'AdGuardHome')" ] || true
	uci commit ucitrack 2>/dev/null
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
