include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dnsfilter
PKG_VERSION:=1.0
PKG_RELEASE:=8
PKG_LICENSE:=GPLv2
PKG_MAINTAINER:=small_5 GaryPang

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=LuCI
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for DNSFilter
  DEPENDS:=+curl +dnsmasq-full +ipset
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
	Luci Support for DNSFilter.
endef

define Build/Prepare
	$(foreach po,$(wildcard ${CURDIR}/po/zh-cn/*.po), \
		po2lmo $(po) $(PKG_BUILD_DIR)/$(patsubst %.po,%.lmo,$(notdir $(po)));)
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/dnsfilter
/etc/dnsfilter/
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	cp -pR ./luasrc/* $(1)/usr/lib/lua/luci
	$(INSTALL_DIR) $(1)/
	cp -pR ./root/* $(1)/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/dnsfilter.*.lmo $(1)/usr/lib/lua/luci/i18n/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
