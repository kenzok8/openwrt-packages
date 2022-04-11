# 
# Copyright (C) 2006-2012 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=app-store-ui
PKG_VERSION:=1.0
PKG_RELEASE:=10

PKG_HOST_ONLY=1

HOST_BUILD_DIR:=$(BUILD_DIR_HOST)/${PKG_NAME}

include $(INCLUDE_DIR)/host-build.mk
include $(INCLUDE_DIR)/package.mk

define Package/app-store-ui
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=App Store UI
  BUILDONLY:=1
endef

define Package/app-store-ui/description
 UI for luci-app-store
endef

define Host/Prepare
	mkdir -p $(HOST_BUILD_DIR)
	$(CP) ./src/. $(HOST_BUILD_DIR)
	find $(HOST_BUILD_DIR) -name .svn | $(XARGS) rm -rf
endef

define Host/Configure
endef

define Host/Compile
endef

define Host/Install
endef

define Host/Clean
	rm -f $(HOST_BUILD_DIR)/src/dist
endef

$(eval $(call HostBuild))
$(eval $(call BuildPackage,app-store-ui))
