# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=gost
PKG_VERSION:=3.2.6
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/go-gost/gost/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=79874354530b899576dd4866d3b1400651d0b17c1e7a90ad30c44686a0642600

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/go-gost/gost
GO_PKG_BUILD_PKG:=$(GO_PKG)/cmd/gost
GO_PKG_LDFLAGS_X:=main.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/gost
  SECTION:=net
  CATEGORY:=Network
  TITLE:=GO Simple Tunnel
  URL:=https://gost.run/
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
  USERID:=gost:gost
endef

define Package/gost/conffiles
/etc/config/gost
/etc/gost/
endef

define Package/gost/install
	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/gost.config $(1)/etc/config/gost
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/gost.init $(1)/etc/init.d/gost
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) $(CURDIR)/files/gost.uci $(1)/etc/uci-defaults/99-gost-migrate
endef

$(eval $(call GoBinPackage,gost))
$(eval $(call BuildPackage,gost))
