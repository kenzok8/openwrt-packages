# Copyright (C) 2020 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-serverchand
PKG_VERSION:=2.00
PKG_RELEASE:=12

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  DEPENDS:=+iputils-arping +curl
  TITLE:=LuCI support for serverchan with DING Talk
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/serverchand
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d $(1)/usr/bin/serverchand $(1)/etc/config $(1)/usr/lib/lua/luci $(1)/etc/uci-defaults $(1)/usr/share/rpcd/acl.d
	$(CP) ./luasrc/* $(1)/usr/lib/lua/luci
	$(INSTALL_CONF) ./root/etc/config/serverchand $(1)/etc/config
	$(INSTALL_BIN) ./root/etc/init.d/serverchand $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/uci-defaults/luci-serverchand $(1)/etc/uci-defaults/luci-serverchand
	$(INSTALL_BIN) ./root/usr/bin/serverchand/serverchand $(1)/usr/bin/serverchand
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-serverchand.json $(1)/usr/share/rpcd/acl.d/luci-app-serverchand.json
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
