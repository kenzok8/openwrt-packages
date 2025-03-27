#
# Copyright (C) 2015-2016 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=alist
PKG_VERSION:=3.44.0
PKG_WEB_VERSION:=3.44.0
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/AlistGo/alist/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=8511e147e912933ba05c31c28f25c4245cc3529f854b0471ba947e33c09f297d

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=sbwml <admin@cooluc.com>

define Download/$(PKG_NAME)-web
  FILE:=$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
  URL_FILE:=dist.tar.gz
  URL:=https://github.com/AlistGo/alist-web/releases/download/$(PKG_WEB_VERSION)/
  HASH:=3709bec59bbc14f0f9f74193cebbb25a317c978fa3a5ae06a900eb341e1b5ae7
endef

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/alist-org/alist
GO_PKG_LDFLAGS:= \
	-X '$(GO_PKG)/v3/internal/conf.BuiltAt=$(shell date '+%Y-%m-%d %H:%M:%S %z')' \
	-X '$(GO_PKG)/v3/internal/conf.GoVersion=$(shell $(STAGING_DIR_HOSTPKG)/bin/go version | sed 's/go version //')' \
	-X '$(GO_PKG)/v3/internal/conf.GitAuthor=Xhofe <i@nn.ci>' \
	-X '$(GO_PKG)/v3/internal/conf.GitCommit=tarball/$(shell echo $(PKG_HASH) | cut -c 1-7)' \
	-X '$(GO_PKG)/v3/internal/conf.Version=v$(PKG_VERSION) (OpenWrt $(ARCH_PACKAGES))' \
	-X '$(GO_PKG)/v3/internal/conf.WebVersion=$(PKG_WEB_VERSION)'

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/$(PKG_NAME)
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=A file list program that supports multiple storage
  URL:=http://www.alistgo.com
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
	$(TAR) --strip-components=1 -C $(PKG_BUILD_DIR)/public/dist -xzf $(DL_DIR)/$(PKG_NAME)-web-$(PKG_WEB_VERSION).tar.gz
	$(SED) 's_https://jsd.nn.ci/gh/alist-org/logo@main/logo.png_/assets/logo.png_g' $(PKG_BUILD_DIR)/public/dist/index.html
ifneq ($(CONFIG_ARCH_64BIT),y)
	$(RM) -rf $(PKG_BUILD_DIR)/drivers/{lark,lark.go}
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

$(eval $(call Download,$(PKG_NAME)-web))
$(eval $(call BuildPackage,$(PKG_NAME)))
