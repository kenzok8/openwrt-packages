# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for quickstart 
LUCI_DEPENDS:=+quickstart +shadow-utils +shadow-useradd +luci-app-store +mount-utils
LUCI_PKGARCH:=all

PKG_VERSION:=0.3.6-1
# PKG_RELEASE MUST be empty for luci.mk
PKG_RELEASE:=

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

