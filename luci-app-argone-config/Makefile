include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-argone-config
PKG_VERSION:=1.0
PKG_RELEASE:=20260316

PKG_MAINTAINER:=jerrykuku <jerrykuku@qq.com>

LUCI_TITLE:=LuCI app for Argone theme configuration
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-theme-argone

define Package/$(PKG_NAME)/conffiles
/etc/config/argone
endef

define Build/Compile
	@mkdir -p $(PKG_BUILD_DIR)/po/ru
	@if [ -f "Package/$(PKG_NAME)/po/ru/argone-config.po" ]; then \
		$(STAGING_DIR_HOSTPKG)/bin/po2lmo \
			"Package/$(PKG_NAME)/po/ru/argone-config.po" \
			"$(PKG_BUILD_DIR)/po/ru/argone-config.lmo"; \
	fi
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
