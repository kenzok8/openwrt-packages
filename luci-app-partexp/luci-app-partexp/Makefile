#
# Copyright (C) 2020-2025 sirpdboy <herboy2008@gmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
# 

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-partexp
LUCI_TITLE:=LuCI Support for Automatic Partition Mount
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+fdisk +block-mount +bc +blkid +parted +btrfs-progs +losetup +resize2fs +e2fsprogs +f2fs-tools +kmod-loop
PKG_VERSION:=2.0.2
PKG_RELEASE:=20251221

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Sirpdboy <herboy2008@gmail.com>



include $(TOPDIR)/feeds/luci/luci.mk


# call BuildPackage - OpenWrt buildroot signature
