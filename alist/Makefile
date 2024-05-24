#
# Copyright (C) 2015-2016 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=alist
PKG_VERSION:=3.35.0
PKG_WEB_VERSION:=3.35.0
PKG_RELEASE:=7

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/alist-org/alist/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=e349a178cd41fff9b668e9d8df9ff1b407b7f6d6fd3dbb2f8a7ca9d0d5ecad55

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=sbwml <admin@cooluc.com>

define Download/$(PKG_NAME)-web
  FILE:=$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
  URL_FILE:=dist.tar.gz
  URL:=https://github.com/alist-org/alist-web/releases/download/$(PKG_WEB_VERSION)/
  HASH:=940608c2b9f64cf585ad4d241545e5f1e59e5f6e54ef8ea2c9c3a29998313fc7
endef

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/alist-org/alist
GO_PKG_LDFLAGS:=-w -s
GO_PKG_LDFLAGS_X:= \
	$(GO_PKG)/v3/internal/conf.Version=v$(PKG_VERSION)-$(ARCH) \
	$(GO_PKG)/v3/internal/conf.WebVersion=$(PKG_WEB_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/$(PKG_NAME)
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=A file list program that supports multiple storage
  URL:=https://alist.nn.ci/
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
endef

define Package/$(PKG_NAME)/conffiles
/etc/alist
/etc/config/alist
endef

define Package/$(PKG_NAME)/description
  A file list program that supports multiple storage, powered by Gin and Solidjs.
endef

ifeq ($(ARCH),arm)
  ARM_CPU_FEATURES:=$(word 2,$(subst +,$(space),$(call qstrip,$(CONFIG_CPU_TYPE))))
  ifeq ($(ARM_CPU_FEATURES),)
    TARGET_CFLAGS:=
    TARGET_LDFLAGS:=
  endif
endif

ifneq ($(CONFIG_USE_MUSL),)
  TARGET_CFLAGS += -D_LARGEFILE64_SOURCE
endif

define Build/Prepare
	$(call Build/Prepare/Default)
	$(eval $(call Download,$(PKG_NAME)-web))
	$(TAR) --strip-components=1 -C $(PKG_BUILD_DIR)/public/dist -xzf $(DL_DIR)/$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
ifneq ($(CONFIG_ARCH_64BIT),y)
	$(RM) -rf $(PKG_BUILD_DIR)/{drivers/lark.go,drivers/lark}
endif
endef

define Package/$(PKG_NAME)/install
	$(call GoPackage/Package/Install/Bin,$(PKG_INSTALL_DIR))
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/alist $(1)/usr/bin
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d $(1)/etc/alist
	$(INSTALL_CONF) $(CURDIR)/files/alist.config $(1)/etc/config/alist
	$(INSTALL_BIN) $(CURDIR)/files/alist.init $(1)/etc/init.d/alist
	$(INSTALL_DATA) $(CURDIR)/files/data.db $(1)/etc/alist/data.db
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
