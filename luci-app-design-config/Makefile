include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-design-config
PKG_VERSION:=1.3
PKG_RELEASE:=20230306

PKG_MAINTAINER:=gngpp <gngppz@gmail.com>

LUCI_TITLE:=LuCI page for Design Config
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-compat

define Package/$(PKG_NAME)/conffiles
/etc/config/design
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
