# Copyright (C) 2019  sirpdboy <https://github.com/sirpdboy/luci-app-advanced/>
# 
#
#
# This is free software, licensed under the Apache License, Version 2.0 .
# 

include $(TOPDIR)/rules.mk
include $(INCLUDE_DIR)/package.mk

PKG_NAME:=luci-app-advanced
PKG_VERSION:=1.8
PKG_RELEASE:=3
define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  DEPENDS:=
   TITLE:=LuCI Support for advanced and filebrowser
   PKGARCH:=all
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	$(CP) ./luasrc/* $(1)/usr/lib/lua/luci
	
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/advanced $(1)/etc/config/
	
	$(INSTALL_DIR) $(1)/www
	cp -pR ./htdocs/* $(1)/www/
	
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/* $(1)/etc/uci-defaults/
	
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
