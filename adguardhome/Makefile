#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=adguardhome
PKG_VERSION:=0.107.56
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/AdguardTeam/AdGuardHome/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=e4285c8d7611fe677e45dad469fbc0237ebeea57094148a059edd5aa32ab8fce
PKG_BUILD_DIR:=$(BUILD_DIR)/AdGuardHome-$(PKG_VERSION)

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
        HASH:=f7d6308d17ed7ac97b62e4cb5bec79a647695ade94b91a8803a6dc0fdbac407f
endef

define Build/Prepare
	$(call Build/Prepare/Default)

	gzip -dc $(DL_DIR)/$(FRONTEND_FILE) | $(HOST_TAR) -C $(PKG_BUILD_DIR)/ $(TAR_OPTIONS)
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
