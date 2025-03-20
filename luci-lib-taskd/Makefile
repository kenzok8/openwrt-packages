#
# Copyright (C) 2022 jjm2473 <jjm2473@gmail.com>
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Task library
LUCI_DEPENDS:=+luci-lib-xterm +taskd
LUCI_EXTRA_DEPENDS:=taskd (>=1.0.3-1)
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.23
PKG_RELEASE:=
PKG_MAINTAINER:=jjm2473 <jjm2473@gmail.com>

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
