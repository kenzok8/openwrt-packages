# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI based ipk store
LUCI_DESCRIPTION:=luci-app-store is a ipk store developed by LinkEase team
LUCI_DEPENDS:=+curl +opkg +luci-base +tar +coreutils +coreutils-stat +libuci-lua +mount-utils
LUCI_PKGARCH:=all

PKG_VERSION:=0.1.9-1
# PKG_RELEASE MUST be empty for luci.mk
PKG_RELEASE:=

ISTORE_UI_VERSION:=1.0
ISTORE_UI_RELEASE:=13
PKG_HASH:=d17c2ae0263387176c3d1c01eca405fc20b06acecfd4d93c3b5d0ad6709a2b3d

PKG_SOURCE_URL_FILE:=v$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE).tar.gz
PKG_SOURCE:=istore-ui-$(PKG_SOURCE_URL_FILE)
PKG_SOURCE_URL:=https://github.com/linkease/istore-ui/archive/refs/tags

PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

TARGET_CONFIGURE_OPTS= FRONTEND_DIST="$(BUILD_DIR)/istore-ui-$(ISTORE_UI_VERSION)-$(ISTORE_UI_RELEASE)/app-store-ui/src/dist" APP_STORE_VERSION="$(PKG_VERSION)"
TARGET_CONFIGURE_OPTS+= SED="$(SED)"

define Package/luci-app-store/conffiles
/etc/.app_store.id
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

