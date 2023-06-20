# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-alist
PKG_VERSION:=1.0.9
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for alist
LUCI_DEPENDS:=+alist +luci-compat

define Package/$(PKG_NAME)/conffiles
/etc/alist
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	( . /etc/uci-defaults/luci-alist ) && rm -f /etc/uci-defaults/luci-alist
	exit 0
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
