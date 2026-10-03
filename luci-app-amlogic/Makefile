#=====================================================================================================
# This file is licensed under the terms of the GNU General Public
# License version 2. This program is licensed "as is" without any
# warranty of any kind, whether express or implied.
#
# This file is a part of the luci-app-amlogic plugin
# https://github.com/ophub/luci-app-amlogic
#
# Description: Supports install/update/backup/restore/snapshot operations using OpenWrt on many boxes
# Copyright (C) 2021- https://github.com/unifreq/openwrt_packit
# Copyright (C) 2021- https://github.com/ophub/luci-app-amlogic
#
# Command: curl -fsSL git.io/luci-app-amlogic | bash
#=====================================================================================================

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-amlogic
# Version format: YY.MM.DDNN
#   YY = year   (26 = 2026)
#   MM = month  (10 = October)
#   DD = day    (01 = 1st)
#   NN = daily release sequence (01 = first release of the day, 02 = second, ...)
# Example below: 26.10.0101 = October 1, 2026, 1st release of the day
PKG_VERSION:=26.10.0301
# PKG_RELEASE marks the LuCI variant; onekey-install.sh relies on it (do NOT bump)
#   1 = Lua version (lua branch)  → tag: 26.10.0101
#   2 = JS version  (main branch) → tag: 26.10.0101-js
PKG_RELEASE:=2

PKG_LICENSE:=GPL-2.0 License
PKG_MAINTAINER:=ophub <https://github.com/ophub/luci-app-amlogic>

LUCI_TITLE:=LuCI support for custom TV boxes
LUCI_PKGARCH:=all
LUCI_DEPENDS:= \
	@(aarch64||arm) +luci-base +rpcd +rpcd-mod-ucode \
	+bash +blkid +block-mount +curl +dosfstools +e2fsprogs \
	+fdisk +jq +losetup +lsblk +parted +perl +pv +uuidgen

define Package/$(PKG_NAME)/conffiles
/etc/config/amlogic
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
