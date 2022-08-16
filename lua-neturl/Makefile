# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2022 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=neturl
PKG_VERSION:=1.1-1
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/golgote/neturl/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=25f3a94ba9f435ef1395555de2bf17d6f934d789fa515ed965405919e42be27b

PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>
PKG_LICENSE:=MIT
PKG_LICNESE_FILES:=LICENSE.txt

include $(INCLUDE_DIR)/package.mk

define Package/lua-neturl
  SUBMENU:=Lua
  SECTION:=lang
  CATEGORY:=Languages
  TITLE:=URL and Query string parser, builder, normalizer for Lua
  URL:=https://github.com/golgote/neturl
  DEPENDS:=+lua
  PKGARCH:=all
endef

define Package/lua-neturl/description
  This small Lua library provides a few functions to parse URL with
  querystring and build new URL easily.
endef

define Build/Compile
endef

define Package/lua-neturl/install
	$(INSTALL_DIR) $(1)/usr/lib/lua
	$(CP) $(PKG_BUILD_DIR)/lib/net/url.lua $(1)/usr/lib/lua/
endef

$(eval $(call BuildPackage,lua-neturl))
