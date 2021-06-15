#
# Copyright (C) 2014 OpenWrt-dist
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=tcping
PKG_VERSION:=0.3
PKG_RELEASE:=$(AUTORELEASE)

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/Mattraks/tcping.git
PKG_SOURCE_DATE:=2020-11-18
PKG_SOURCE_VERSION:=de2b709f8c386507678041d11102c671d470fea7
PKG_MIRROR_HASH:=07359ac47f0da4fb30215e5160f7c0c942f0a4af4e7b2e2d2b4ffd9769823054

PKG_LICENSE:=GPL-2.0-only
PKG_LICENSE_FILE:=license.txt

PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/tcping
	SECTION:=net
	CATEGORY:=Network
	TITLE:=tcping measures the latency of a tcp-connection
	URL:=https://github.com/Mattraks/tcping
endef

define Package/tcping/description
endef

define Package/tcping/conffiles
endef

define Package/tcping/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/tcping $(1)/usr/sbin
endef

$(eval $(call BuildPackage,tcping))