# SPDX-License-Identifier: MIT
#
# Tower backend: subscription parser + client config generator.

include $(TOPDIR)/rules.mk

PKG_NAME:=tower
PKG_VERSION:=1.0.0
PKG_RELEASE:=13

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

PKG_LICENSE:=MIT
PKG_MAINTAINER:=kenzok8 <kenzok8@gmail.com>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/kenzok8/tower
GO_PKG_BUILD_PKG:=$(GO_PKG)/cmd/tower

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/tower
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Tower subscription parser and config generator
  URL:=https://github.com/kenzok8/openwrt-tower
  DEPENDS:=+ca-bundle
endef

define Package/tower/description
  Tower parses airport subscriptions, manages nodes locally, and generates
  Surge / Clash / Shadowrocket / sing-box configurations.
endef

define Package/tower/conffiles
/etc/config/tower
endef

define Build/Prepare
	$(RM) -r $(PKG_BUILD_DIR)
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(CURDIR)/cmd $(CURDIR)/internal $(CURDIR)/files $(CURDIR)/go.mod $(CURDIR)/go.sum $(PKG_BUILD_DIR)/
endef

define Package/tower/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/tower.init $(1)/etc/init.d/tower
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/tower.config $(1)/etc/config/tower
	$(INSTALL_DIR) $(1)/etc/tower/rules
	$(INSTALL_DATA) $(CURDIR)/files/rules/*.ini $(1)/etc/tower/rules/
	$(INSTALL_DATA) $(CURDIR)/files/rules/*.yaml $(1)/etc/tower/rules/
	$(INSTALL_DATA) $(CURDIR)/files/rules/*.list $(1)/etc/tower/rules/
	$(INSTALL_DATA) $(CURDIR)/files/rules/*.txt $(1)/etc/tower/rules/
endef

$(eval $(call GoPackage,$(PKG_NAME)))
$(eval $(call BuildPackage,$(PKG_NAME)))
