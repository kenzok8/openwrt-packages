# luci-app-openclaw — OpenWrt LuCI plugin for OpenClaw AI Gateway
# Dual-version: supports luci 18.06 (Lua CBI) + luci 24.10+ (JS view)
# Works as feeds source or standalone in package/ directory

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-openclaw
PKG_VERSION:=2026.03.30
PKG_RELEASE:=1

PKG_MAINTAINER:=kenzok8
PKG_LICENSE:=GPL-3.0

LUCI_TITLE:=OpenClaw AI Gateway
LUCI_DEPENDS:=+luci-compat +luci-base +curl +openssl-util
LUCI_PKGARCH:=all

# Prefer feeds/luci/luci.mk (handles install + i18n automatically)
LUCI_MK:=$(firstword $(wildcard $(TOPDIR)/feeds/luci/luci.mk))

ifneq ($(LUCI_MK),)
  include $(LUCI_MK)
else
  # Standalone mode: no luci feed available
  include $(INCLUDE_DIR)/package.mk

  define Package/$(PKG_NAME)
    SECTION:=luci
    CATEGORY:=LuCI
    SUBMENU:=3. Applications
    TITLE:=$(LUCI_TITLE)
    DEPENDS:=$(LUCI_DEPENDS)
    PKGARCH:=all
  endef

  define Package/$(PKG_NAME)/description
    OpenClaw AI Gateway LuCI management plugin.
    Supports 12+ AI model providers and multiple messaging channels.
  endef

  define Package/$(PKG_NAME)/install
	# JS view (luci 24.10+)
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/openclaw.js \
		$(1)/www/luci-static/resources/view/openclaw.js
	# Lua compat (luci 18.06)
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./luasrc/controller/openclaw.lua \
		$(1)/usr/lib/lua/luci/controller/openclaw.lua
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/model/cbi
	$(INSTALL_DATA) ./luasrc/model/cbi/openclaw.lua \
		$(1)/usr/lib/lua/luci/model/cbi/openclaw.lua
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/openclaw
	$(INSTALL_DATA) ./luasrc/view/openclaw/status.htm \
		$(1)/usr/lib/lua/luci/view/openclaw/status.htm
	$(INSTALL_DATA) ./luasrc/view/openclaw/console.htm \
		$(1)/usr/lib/lua/luci/view/openclaw/console.htm
	$(INSTALL_DATA) ./luasrc/view/openclaw/terminal.htm \
		$(1)/usr/lib/lua/luci/view/openclaw/terminal.htm
	# root overlay
	$(CP) ./root/* $(1)/
	# fix permissions
	chmod 755 $(1)/etc/init.d/openclaw 2>/dev/null || true
	chmod 755 $(1)/etc/uci-defaults/99-openclaw 2>/dev/null || true
	chmod 755 $(1)/usr/bin/openclaw-env 2>/dev/null || true
	chmod 755 $(1)/usr/share/openclaw/oc-config.sh 2>/dev/null || true
	chmod 755 $(1)/usr/share/openclaw/luci-helper 2>/dev/null || true
  endef
endif

define Package/$(PKG_NAME)/conffiles
/etc/config/openclaw
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	( . /etc/uci-defaults/99-openclaw ) && rm -f /etc/uci-defaults/99-openclaw
	rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null
	exit 0
}
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
