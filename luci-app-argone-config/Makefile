include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-argone-config
PKG_VERSION:=0.9
PKG_RELEASE:=20220424

PKG_MAINTAINER:=jerrykuku <jerrykuku@qq.com>

LUCI_TITLE:=LuCI page for Argone Config
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-compat +luci-theme-argone +luci-lib-ipkg +luci-theme-argone

define Package/$(PKG_NAME)/conffiles
/etc/config/argone
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
