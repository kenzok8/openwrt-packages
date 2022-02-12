include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mosdns
PKG_VERSION:=1.2
PKG_RELEASE:=1

LUCI_TITLE:=LuCI Support for mosdns
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+mosdns +jsonfilter +bash

define Package/$(PKG_NAME)/conffiles
/etc/mosdns/cus_config.yaml
/etc/config/mosdns
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
