include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mosdns
PKG_VERSION:=1.5
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for mosdns
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+mosdns-v5 +jsonfilter +bash +luci-compat +zoneinfo-asia

define Package/$(PKG_NAME)/conffiles
/etc/mosdns/cus_config.yaml
/etc/config/mosdns
/etc/mosdns/rule
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
