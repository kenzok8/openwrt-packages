# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI based ipk store
LUCI_DESCRIPTION:=luci-app-store is a ipk store developed by LinkEase team
LUCI_DEPENDS:=+curl
LUCI_PKGARCH:=all
PKG_VERSION:=0.1.3
PKG_RELEASE:=1
PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

LUCI_BUILD_DEPENDS:=app-store-ui/host

TARGET_CONFIGURE_OPTS = FRONTEND_DIST="$(BUILD_DIR_HOST)/app-store-ui/dist" APP_STORE_VERSION="$(PKG_VERSION)-$(PKG_RELEASE)"

define Package/luci-app-store/conffiles
/etc/.app_store.id
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

