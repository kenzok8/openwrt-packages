#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=adguardhome
PKG_VERSION:=0.107.46
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/AdguardTeam/AdGuardHome/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=d803348688ff0d44f20bd201801720f2f0bd48528c20abc48da9a01a59de65a9

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILES:=LICENSE.txt
PKG_MAINTAINER:=Dobroslaw Kijowski <dobo90@gmail.com>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/AdguardTeam/AdGuardHome
GO_PKG_BUILD_PKG:=$(GO_PKG)

AGH_BUILD_TIME:=$(shell date -d @$(SOURCE_DATE_EPOCH) +%FT%TZ%z)
GO_PKG_LDFLAGS_X:= \
	$(GO_PKG)/internal/version.channel=release \
	$(GO_PKG)/internal/version.version=v$(PKG_VERSION) \
	$(GO_PKG)/internal/version.buildtime=$(AGH_BUILD_TIME) \
	$(GO_PKG)/internal/version.goarm=$(GO_ARM) \
	$(GO_PKG)/internal/version.gomips=$(GO_MIPS)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/adguardhome
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Network-wide ads and trackers blocking DNS server
  URL:=https://github.com/AdguardTeam/AdGuardHome
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
endef

define Package/adguardhome/conffiles
/etc/adguardhome.yaml
/etc/config/adguardhome
endef

define Package/adguardhome/description
  Free and open source, powerful network-wide ads and trackers blocking DNS server.
endef

FRONTEND_FILE:=$(PKG_NAME)-frontend-$(PKG_VERSION).tar.gz
define Download/adguardhome-frontend
	URL:=https://github.com/AdguardTeam/AdGuardHome/releases/download/v$(PKG_VERSION)/
	URL_FILE:=AdGuardHome_frontend.tar.gz
	FILE:=$(FRONTEND_FILE)
	HASH:=c2dc0fac6a564a88575429576f88089dce76ca85b3be9c03e4c3722fa90bd186
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	if [ -d "$(BUILD_DIR)/AdGuardHome-$(PKG_VERSION)" ]; then \
		mv "$(BUILD_DIR)/AdGuardHome-$(PKG_VERSION)/"* "$(BUILD_DIR)/adguardhome-$(PKG_VERSION)/"; \
	fi

	gzip -dc $(DL_DIR)/$(FRONTEND_FILE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/ $(TAR_OPTIONS)
	( cd "$(BUILD_DIR)/adguardhome-$(PKG_VERSION)"; go mod tidy )
endef

define Package/adguardhome/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/adguardhome.init $(1)/etc/init.d/adguardhome

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/adguardhome.config $(1)/etc/config/adguardhome
endef

$(eval $(call Download,adguardhome-frontend))
$(eval $(call GoBinPackage,adguardhome))
$(eval $(call BuildPackage,adguardhome))
