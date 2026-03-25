# luci-i18n-openclaw-zh-cn — OpenWrt package Makefile for Chinese translation
#
# This package provides the Chinese translation for luci-app-openclaw.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-i18n-openclaw-zh-cn
PKG_VERSION:=$(strip $(shell cat $(CURDIR)/../luci-app-openclaw/VERSION 2>/dev/null || echo "1.0.0"))
PKG_RELEASE:=1

PKG_MAINTAINER:=10000ge10000 <10000ge10000@users.noreply.github.com>
PKG_LICENSE:=GPL-3.0

LUCI_TITLE:=OpenClaw AI Gateway LuCI 管理插件 (中文)
LUCI_DEPENDS:=+luci-app-openclaw

include $(TOPDIR)/feeds/luci/luci.mk

# Ensure the .po file from luci-app-openclaw is used
define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	if [ -f "$(TOPDIR)/feeds/$(LUCI_FEED)/luci-app-openclaw/po/zh-cn/openclaw.po" ]; then \
		po2lmo "$(TOPDIR)/feeds/$(LUCI_FEED)/luci-app-openclaw/po/zh-cn/openclaw.po" $(1)/usr/lib/lua/luci/i18n/openclaw.zh-cn.lmo; \
	elif [ -f "$(TOPDIR)/package/luci-app-openclaw/po/zh-cn/openclaw.po" ]; then \
		po2lmo "$(TOPDIR)/package/luci-app-openclaw/po/zh-cn/openclaw.po" $(1)/usr/lib/lua/luci/i18n/openclaw.zh-cn.lmo; \
	else \
		echo "Warning: openclaw.po not found for luci-i18n-openclaw-zh-cn" >&2; \
	fi
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
