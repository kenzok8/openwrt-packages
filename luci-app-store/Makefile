# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI based ipk/apk store
LUCI_DESCRIPTION:=luci-app-store is a ipk/apk store developed by LinkEase team
LUCI_DEPENDS:=+curl +tar +libuci-lua +mount-utils +luci-lib-taskd
LUCI_DEPENDS+=$(if $(CONFIG_USE_APK),+apk +luci-compat,+opkg)

LUCI_EXTRA_DEPENDS:=luci-lib-taskd (>=1.0.19)
LUCI_PKGARCH:=all

PKG_VERSION:=0.2.0-r3
# PKG_RELEASE MUST be empty for luci.mk
PKG_RELEASE:=

ISTORE_UI_VERSION:=0.2.0
ISTORE_UI_RELEASE:=2
PKG_HASH:=9aec741aa5675347bc5a818acb285901bddf309af8ae402dd898336751de38be

PKG_SOURCE_URL_FILE:=v$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE).tar.gz
PKG_SOURCE:=istore-ui-$(PKG_SOURCE_URL_FILE)
PKG_SOURCE_URL:=https://github.com/linkease/istore-ui/archive/refs/tags

PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

TARGET_CONFIGURE_OPTS= FRONTEND_DIST="$(BUILD_DIR)/istore-ui-$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE)/app-store-ui/src/dist" APP_STORE_VERSION="$(PKG_VERSION)"
TARGET_CONFIGURE_OPTS+= SED="$(SED)"
TARGET_CONFIGURE_OPTS+= USE_APK="$(CONFIG_USE_APK)"

define Package/luci-app-store/conffiles
/etc/.app_store.id
/etc/config/istore
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

