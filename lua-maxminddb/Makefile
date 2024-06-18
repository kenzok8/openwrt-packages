# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2020 jerryk <jerrykuku@qq.com>
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=lua-maxminddb
PKG_VERSION:=0.2
PKG_RELEASE:=2

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/fabled/lua-maxminddb.git
PKG_SOURCE_DATE:=2019-03-14
PKG_SOURCE_VERSION:=93da9f4e6c814c3a23044dd2cdd22d4a6b4f665b
PKG_MIRROR_HASH:=e70dd8843c3688b58f66fff5320a93d5789b79114bcb36a94d5b554664439f04

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/lua-maxminddb
  SUBMENU:=Lua
  SECTION:=lang
  CATEGORY:=Languages
  TITLE:=libmaxminddb bindings for lua
  URL:=https://github.com/fabled/lua-maxminddb
  DEPENDS:=+lua +libmaxminddb
endef

TARGET_CFLAGS += $(FPIC)

MAKE_VARS += LUA_PKG=lua

define Package/lua-maxminddb/install
	$(INSTALL_DIR) $(1)/usr/lib/lua
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/maxminddb.so $(1)/usr/lib/lua/
endef

$(eval $(call BuildPackage,lua-maxminddb))
