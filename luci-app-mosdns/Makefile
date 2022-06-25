include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mosdns
PKG_VERSION:=1.4
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for mosdns
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+mosdns_neo +jsonfilter +bash +luci-compat +v2ray-geoip +v2ray-geosite

define Package/$(PKG_NAME)/conffiles
/etc/mosdns/cus_config.yaml
/etc/config/mosdns
/etc/mosdns/rule
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
