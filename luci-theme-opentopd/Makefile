# Copyright (C) 2008-2019 Jerrykuku
# Copyright (C) 2019-2023 sirpdboy
# http://www.github.com/sirpdboy/luci-theme-opentopd
# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

THEME_NAME:=opentopd
THEME_TITLE:=opentopd Theme

PKG_NAME:=luci-theme-$(THEME_NAME)
PKG_VERSION:=1.6.0
PKG_RELEASE:=20230207

include $(INCLUDE_DIR)/package.mk

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-theme-opentopd/postinst
#!/bin/sh

rm -Rf /var/luci-modulecache
rm -Rf /var/luci-indexcache
exit 0

endef
# call BuildPackage - OpenWrt buildroot signature
