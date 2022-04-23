#===================================================================================================
# This file is licensed under the terms of the GNU General Public
# License version 2. This program is licensed "as is" without any
# warranty of any kind, whether express or implied.
#
# This file is a part of the luci-app-amlogic plugin
# https://github.com/ophub/luci-app-amlogic
#
# Description: Support install/update/backup/restore/snapshot etc for OpenWrt on amlogic s9xxx boxs
# Copyright (C) 2021- The Upload file functions by luci-app-filetransfer
# Copyright (C) 2021- The CPU Settings functions by luci-app-cpufreq
# Copyright (C) 2021- The Log viewing and version query functions by Vernesong
# Copyright (C) 2021- The Kernel and scripts etc by unifreq
# Copyright (C) 2021- https://github.com/unifreq/openwrt_packit
# Copyright (C) 2021- https://github.com/ophub/luci-app-amlogic
#===================================================================================================

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-amlogic
PKG_VERSION:=3.1.84
PKG_RELEASE:=1

PKG_LICENSE:=GPL-2.0 License
PKG_MAINTAINER:=ophub <https://github.com/ophub/luci-app-amlogic>

LUCI_TITLE:=LuCI support for Amlogic, Allwinner and Rockchip related boxs
LUCI_PKGARCH:=all
LUCI_DEPENDS:= \
	@(aarch64||arm) +luci-lib-fs +block-mount +blkid +parted \
	+dosfstools +e2fsprogs +lsblk +pv +resize2fs +losetup +uuidgen

define Package/$(PKG_NAME)/conffiles
/etc/config/amlogic
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
