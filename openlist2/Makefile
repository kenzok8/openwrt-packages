#
# Copyright (C) 2015-2016 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=openlist2
PKG_VERSION:=4.1.9
PKG_WEB_VERSION:=4.1.9
PKG_RELEASE:=1

PKG_SOURCE:=openlist-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/OpenListTeam/OpenList/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=5171cef3b03f6b68af0e4886af7b6f5a6f9c103de41c3b831f46dcb3ddcc6f18

PKG_BUILD_DIR:=$(BUILD_DIR)/OpenList-$(PKG_VERSION)

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=sbwml <admin@cooluc.com>

define Download/openlist-frontend
  FILE:=openlist-frontend-dist-lite-v$(PKG_WEB_VERSION).tar.gz
  URL:=https://github.com/OpenListTeam/OpenList-Frontend/releases/download/v$(PKG_WEB_VERSION)/
  HASH:=460db8632ff7faf00e651f0fd92d3e85eb6770529313f193c8b418156eaa08c6
endef

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/OpenListTeam/OpenList
GO_PKG_LDFLAGS:= \
	-X '$(GO_PKG)/v4/internal/conf.BuiltAt=$(shell date '+%Y-%m-%d %H:%M:%S %z')' \
	-X '$(GO_PKG)/v4/internal/conf.GoVersion=$(shell $(STAGING_DIR_HOSTPKG)/bin/go version | sed 's/go version //')' \
	-X '$(GO_PKG)/v4/internal/conf.GitAuthor=The OpenList Projects Contributors <noreply@openlist.team>' \
	-X '$(GO_PKG)/v4/internal/conf.GitCommit=tarball/$(shell echo $(PKG_HASH) | cut -c 1-7)' \
	-X '$(GO_PKG)/v4/internal/conf.Version=v$(PKG_VERSION) (OpenWrt $(ARCH_PACKAGES))' \
	-X '$(GO_PKG)/v4/internal/conf.WebVersion=v$(PKG_WEB_VERSION)'
ifneq ($(CONFIG_ARCH_64BIT),y)
  GO_PKG_EXCLUDES:=drivers/lark
endif

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/openlist2
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=A file list program that supports multiple storage
  URL:=https://openlist.team/
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
endef

define Package/openlist2/conffiles
/etc/openlist2
/etc/config/openlist2
endef

define Package/openlist2/description
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
	$(TAR) --strip-components=1 -C $(PKG_BUILD_DIR)/public/dist -xzf $(DL_DIR)/openlist-frontend-dist-lite-v$(PKG_WEB_VERSION).tar.gz
	$(SED) 's_https://res.oplist.org/logo_/assets_g' $(PKG_BUILD_DIR)/public/dist/index.html
	$(SED) 's_https://res.oplist.org/logo_/assets_g' $(PKG_BUILD_DIR)/public/dist/static/manifest.json
endef

define Package/openlist2/install
	$(call GoPackage/Package/Install/Bin,$(PKG_INSTALL_DIR))
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/OpenList $(1)/usr/bin/openlist2
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d $(1)/etc/openlist2
	$(INSTALL_CONF) $(CURDIR)/files/openlist2.config $(1)/etc/config/openlist2
	$(INSTALL_BIN) $(CURDIR)/files/openlist2.init $(1)/etc/init.d/openlist2
	$(INSTALL_DATA) $(CURDIR)/files/data.db $(1)/etc/openlist2/data.db
endef

$(eval $(call Download,openlist-frontend))
$(eval $(call BuildPackage,openlist2))
