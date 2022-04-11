# Copyright (C) 2016 Openwrt.org
# 
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Koolddns
PKG_NAME:=luci-app-koolddns
PKG_VERSION:=20220321
PKG_RELEASE:=2
PKG_MAINTAINER:=fw867

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)
#PKG_USE_MIPS16:=0

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	PKGARCH:=all
	TITLE:=luci for koolddns
        DEPENDS:=+koolddns
endef

define Package/$(PKG_NAME)/description
    A luci app for koolddns, forked from koolshare Lede X64. Thanks to fw867.
endef

define Package/$(PKG_NAME)/preinst
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	if [ -f /etc/uci-defaults/luci-koolddns ]; then
		( . /etc/uci-defaults/luci-koolddns ) && rm -f /etc/uci-defaults/luci-koolddns
	fi
	rm -rf /tmp/luci-indexcache
fi
exit 0
endef
define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature


