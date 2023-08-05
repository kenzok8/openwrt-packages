include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-wechatpush
PKG_VERSION:=3.3.2
PKG_RELEASE:=12

PKG_MAINTAINER:=tty228 <tty228@yeah.net>

LUCI_TITLE:=LuCI support for wechatpush
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+iputils-arping +curl +jq +bash

define Package/$(PKG_NAME)/conffiles
/etc/config/wechatpush
/usr/share/wechatpush/api/diy.json
/usr/share/wechatpush/api/logo.jpg
/usr/share/wechatpush/api/ipv4.list
/usr/share/wechatpush/api/ipv6.list
/usr/share/wechatpush/api/device_aliases.list
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
