#
# Copyright (C) 2015-2016 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=alist
PKG_VERSION:=3.16.0
PKG_WEB_VERSION:=3.16.0
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/alist-org/alist/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=5f946c95a769f2ba85a53612082f33d742110426cbcbc954d5b8395a071b3135

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=sbwml <admin@cooluc.com>

define Download/$(PKG_NAME)-web
  FILE:=$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
  URL_FILE:=dist.tar.gz
  URL:=https://github.com/alist-org/alist-web/releases/download/$(PKG_WEB_VERSION)/
  HASH:=0a08e205887dcaf17f5e57af5a2024021e35e3d29878259d372d980bbea3eedd
endef

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

PKG_ALIST:=github.com/alist-org/alist/v3/internal/conf
GO_PKG:=github.com/alist-org/alist
GO_PKG_LDFLAGS:=-w -s
GO_PKG_LDFLAGS_X:= \
	$(PKG_ALIST).Version=v$(PKG_VERSION)-$(ARCH) \
	$(PKG_ALIST).WebVersion=$(PKG_WEB_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/$(PKG_NAME)
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=A file list program that supports multiple storage
  URL:=https://alist-doc.nn.ci/
  DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/$(PKG_NAME)/description
  A file list program that supports multiple storage, powered by Gin and Solidjs.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(eval $(call Download,$(PKG_NAME)-web))
	$(TAR) --strip-components=1 -C $(PKG_BUILD_DIR)/public/dist -xzf $(DL_DIR)/$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
	$(CP) ./files/assets/. $(PKG_BUILD_DIR)/public/dist/assets/
endef

define Package/$(PKG_NAME)/install
	$(call GoPackage/Package/Install/Bin,$(PKG_INSTALL_DIR))
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/alist $(1)/usr/bin
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
