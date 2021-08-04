include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-control-speedlimit
PKG_VERSION:=v4.0.4
PKG_RELEASE:=20210515

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  DEPENDS:=+tc +bash +kmod-ifb +kmod-sched +kmod-sched-core
  TITLE:=LuCI support for speedlimit
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
rm -f /tmp/luci-*
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/speedlimit
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	cp -pR ./luasrc/* $(1)/usr/lib/lua/luci

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./root/etc/hotplug.d/iface/* $(1)/etc/hotplug.d/iface/
	
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/* $(1)/etc/uci-defaults/
	
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/* $(1)/etc/config/

	# $(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	# po2lmo ./po/zh-cn/*.po $(1)/usr/lib/lua/luci/i18n/speedlimit.zh-cn.lmo
endef

$(eval $(call BuildPackage,$(PKG_NAME)))