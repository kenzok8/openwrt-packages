#
# Copyright (C) 2017-2019 Chen Minqiang <ptpt52@gmail.com>
# Copyright 2022-2025 sirpdboy <herboy2008@gmail.com>
# This is free software, licensed under the GNU General Public License v3.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Support for wizard
LUCI_DEPENDS:=
LUCI_PKGARCH:=all
PKG_NAME:=luci-app-netwizard
PKG_VERSION:=2.1.5
PKG_RELEASE:=20260312

PKG_LICENSE:=GPLv3
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=sirpdboy <herboy2008@gmail.com>


define Package/luci-app-netwizard
	CATEGORY:=X
	SUBMENU:=Configuration netWizard Support
	TITLE:=LuCI Support for netwizard
	PKGARCH:=all
endef

define Package/luci-app-netwizard/description
	LuCI Support for netwizard.
endef
define Package/luci-app-netwizard/conffiles
/etc/config/netwizard
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature