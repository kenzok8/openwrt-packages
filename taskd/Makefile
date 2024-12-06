#
# Copyright (C) 2022 jjm2473 <jjm2473@gmail.com>
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk


PKG_NAME:=taskd
PKG_VERSION:=1.0.3
PKG_RELEASE:=2
PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=utils
	CATEGORY:=Utilities
	TITLE:=Simple Task Manager
	DEPENDS:=+procd +script-utils +coreutils +coreutils-stty
	PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
	Simple Task Manager based on procd
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d $(1)/usr/libexec
	$(INSTALL_BIN) ./files/tasks.init $(1)/etc/init.d/tasks
	$(INSTALL_BIN) ./files/taskd.sh $(1)/usr/libexec/taskd
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
