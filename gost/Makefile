# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=gost
PKG_VERSION:=2.11.4
PKG_RELEASE:=$(AUTORELEASE)

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/ginuerzh/gost/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=aa3211282fce695584795fac20da77a2ac68d3e08602118afb0747bd64c1eac4

PKG_LICENSE:=MIT
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

GO_PKG:=github.com/ginuerzh/gost
GO_PKG_BUILD_PKG:=github.com/ginuerzh/gost/cmd/gost

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/gost
  SECTION:=net
  CATEGORY:=Network
  TITLE:=GO Simple Tunnel
  URL:=https://github.com/ginuerzh/gost
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
endef

define Package/gost/install
	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/gost.config $(1)/etc/config/gost
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/gost.init $(1)/etc/init.d/gost
endef

$(eval $(call GoBinPackage,gost))
$(eval $(call BuildPackage,gost))
