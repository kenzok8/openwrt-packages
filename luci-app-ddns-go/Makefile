# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021-2026  sirpdboy  <herboy2008@gmail.com> 
# https://github.com/sirpdboy/luci-app-ddns-go 
# This is free software, licensed under the Apache License, Version 2.0 .
#
include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-ddns-go
PKG_VERSION:=1.6.5
PKG_RELEASE:=20260123

PKG_MAINTAINER:=sirpdboy  <herboy2008@gmail.com>
PKG_CONFIG_DEPENDS:=

LUCI_TITLE:=LuCI Support for Dynamic ddns-go Client
LUCI_DEPENDS:=+ddns-go
LUCI_PKGARCH:=all



include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
