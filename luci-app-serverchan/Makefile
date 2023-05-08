include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-serverchan
PKG_VERSION:=2.07.1
PKG_RELEASE:=10

PKG_MAINTAINER:=tty228 <tty228@yeah.net>

LUCI_TITLE:=LuCI support for serverchan
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+iputils-arping +curl +jq

define Package/$(PKG_NAME)/conffiles
/etc/config/serverchan
/usr/share/serverchan/api/diy.json
/usr/share/serverchan/api/logo.jpg
/usr/share/serverchan/api/ipv4.list
/usr/share/serverchan/api/ipv6.list
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
