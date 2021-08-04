# Copyright (C) 2016 Openwrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-control-webrestriction
PKG_VERSION:=1.0
PKG_RELEASE:=20210511

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  DEPENDS:=
  TITLE:=LuCI support for webrestriction
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
rm -f /tmp/luci-*
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/webrestriction
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/etc/init.d $(1)/etc/config $(1)/usr/lib/lua/luci
	$(CP) ./luasrc/* $(1)/usr/lib/lua/luci
	$(INSTALL_CONF) ./root/etc/config/* $(1)/etc/config
	$(INSTALL_BIN) ./root/etc/init.d/* $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	po2lmo ./po/zh-cn/*.po $(1)/usr/lib/lua/luci/i18n/webrestriction.zh-cn.lmo
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
