include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-jd-dailybonus

LUCI_TITLE:=Luci for JD dailybonus Script
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+node +wget +lua +libuci-lua

define Package/$(PKG_NAME)/conffiles
/etc/config/jd-dailybonus
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
