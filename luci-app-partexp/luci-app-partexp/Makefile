#
# Copyright (C) 2020-2025 sirpdboy <herboy2008@gmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
# 

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-partexp
PKG_VERSION:=1.3.1
PKG_RELEASE:=20250326

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Sirpdboy <herboy2008@gmail.com>

LUCI_TITLE:=LuCI Support for Automatic Partition Mount
LUCI_DEPENDS:=+fdisk +block-mount +bc +blkid +parted +btrfs-progs
LUCI_PKGARCH:=all


include $(TOPDIR)/feeds/luci/luci.mk


# call BuildPackage - OpenWrt buildroot signature
