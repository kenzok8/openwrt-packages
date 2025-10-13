# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI based ipk store
LUCI_DESCRIPTION:=luci-app-store is a ipk store developed by LinkEase team
LUCI_DEPENDS:=+curl +opkg +luci-base +tar +libuci-lua +mount-utils +luci-lib-taskd
LUCI_EXTRA_DEPENDS:=luci-lib-taskd (>=1.0.19)
LUCI_PKGARCH:=all

PKG_VERSION:=0.1.29-6
# PKG_RELEASE MUST be empty for luci.mk
PKG_RELEASE:=

ISTORE_UI_VERSION:=0.1.28
ISTORE_UI_RELEASE:=3
PKG_HASH:=5097082a9d0821ff23f468f20c7ba9f635a9cb52eeac8b155a55b3441741d260

PKG_SOURCE_URL_FILE:=v$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE).tar.gz
PKG_SOURCE:=istore-ui-$(PKG_SOURCE_URL_FILE)
PKG_SOURCE_URL:=https://github.com/linkease/istore-ui/archive/refs/tags

PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

TARGET_CONFIGURE_OPTS= FRONTEND_DIST="$(BUILD_DIR)/istore-ui-$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE)/app-store-ui/src/dist" APP_STORE_VERSION="$(PKG_VERSION)"
TARGET_CONFIGURE_OPTS+= SED="$(SED)"

define Package/luci-app-store/conffiles
/etc/.app_store.id
/etc/config/istore
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

