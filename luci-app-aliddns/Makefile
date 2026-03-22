# Copyright (C) 2018-2024 OpenWrt luci-app-aliddns contributors
#
# This is free software, licensed under MIT License.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-aliddns
PKG_VERSION:=0.4.3
PKG_RELEASE:=1
PKG_MAINTAINER:=kenzok8 <https://github.com/kenzok78>
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

LUCI_TITLE:=LuCI support for AliDDNS
LUCI_DEPENDS:=+openssl-util +curl
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=Web interface for AliDDNS dynamic DNS service

define Package/luci-app-aliddns/conffiles
/etc/config/aliddns
endef

define Package/luci-app-aliddns/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/aliddns enable 2>/dev/null
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache 2>/dev/null
fi
exit 0
endef

define Package/luci-app-aliddns/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/aliddns stop 2>/dev/null
	/etc/init.d/aliddns disable 2>/dev/null
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
