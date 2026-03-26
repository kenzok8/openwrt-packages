#
#-- Copyright (C) 2021 dz <dingzhong110@gmail.com>
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-easymesh
LUCI_TITLE:=LuCI Support for easymesh
LUCI_DEPENDS:= +kmod-cfg80211 +batctl-default +kmod-batman-adv +wpad-mesh-openssl +dawn
PKG_VERSION:=2.0
PKG_RELEASE:=1
PKG_MAINTAINER:=kenzok78 <https://github.com/kenzok78>
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
$(eval $(call BuildPackage,$(PKG_NAME)))
