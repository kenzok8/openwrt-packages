# Copyright (C) 2018-2024 OpenWrt luci-app-filebrowser contributors
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-filebrowser
PKG_MAINTAINER:=kenzok8 <https://github.com/kenzok78>
PKG_VERSION:=1.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for FileBrowser
LUCI_DEPENDS:=+filebrowser
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=FileBrowser - a web-based file manager for your OpenWrt

define Package/$(PKG_NAME)/conffiles
/etc/config/filebrowser
/etc/init.d/filebrowser
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
	[ -z "$${IPKG_INSTROOT}" ] && /etc/init.d/filebrowser enable 2>/dev/null
	rm -f /tmp/luci-indexcache
exit 0
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/filebrowser disable 2>/dev/null
	/etc/init.d/filebrowser stop 2>/dev/null
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
