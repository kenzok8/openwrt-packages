# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for quickstart 
LUCI_DEPENDS:=+quickstart +luci-app-store
LUCI_PKGARCH:=all

PKG_VERSION:=0.17.1-rc20261028-r2
# PKG_RELEASE MUST be empty for luci.mk
PKG_RELEASE:=

ifeq ($(CONFIG_USE_APK),y)
PKG_VERSION:=$(subst -rc,_rc,$(PKG_VERSION))
endif

LUCI_MINIFY_CSS:=0
LUCI_MINIFY_JS:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
