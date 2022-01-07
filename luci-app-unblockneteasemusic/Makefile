# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2019-2021 Tianling Shen <cnsztl@immortalwrt.org>

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for UnblockNeteaseMusic
LUCI_DEPENDS:=+busybox +dnsmasq-full +ipset +jsonfilter +node +uclient-fetch \
	@(PACKAGE_libustream-mbedtls||PACKAGE_libustream-openssl||PACKAGE_libustream-wolfssl)
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-unblockneteasemusic
PKG_VERSION:=2.12
PKG_RELEASE:=2

PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
