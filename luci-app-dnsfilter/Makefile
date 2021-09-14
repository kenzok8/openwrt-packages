include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dnsfilter
PKG_VERSION:=1.0
PKG_RELEASE:=11

PKG_LICENSE:=GPLv2
PKG_MAINTAINER:=small_5 kiddin9

LUCI_TITLE:=LuCI support for DNSFilter
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+curl +dnsmasq-full +ipset

define Package/$(PKG_NAME)/conffiles
/etc/config/dnsfilter
/etc/dnsfilter/
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
