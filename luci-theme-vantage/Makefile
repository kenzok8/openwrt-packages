#
# Vantage - a LuCI theme for OpenWrt
# Copyright (C) 2026 anothaDev
#
# This is free software, licensed under the GNU General Public License,
# version 3 or (at your option) any later version.
# Original work; see NOTICE.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-theme-vantage
PKG_VERSION:=1.0.20
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-or-later

LUCI_TITLE:=Vantage theme
LUCI_DESCRIPTION:=A console-style LuCI theme: icon rail with flyouts, \
	breadcrumb, page tabs, Ctrl+K command palette, light and dark modes.
LUCI_DEPENDS:=+luci-base
LUCI_MAINTAINER:=anothaDev <10740588+anothaDev@users.noreply.github.com>
LUCI_URL:=https://github.com/anothaDev/luci-theme-vantage

# The stylesheet uses modern CSS (custom properties, :is(), :has(),
# :where(), color-mix(), inset) that csstidy mangles, so it ships as
# written. JavaScript still goes through LuCI's jsmin when CONFIG_LUCI_JSMIN
# is set (checked: the minified theme scripts parse and keep every regex).
LUCI_MINIFY_CSS:=0

# Language packages (po/<lang>/vantage-theme.po): luci.mk would name them
# after "vantage", like the app's; this keeps them apart
# (luci-i18n-vantage-theme-<lang>, i18n/vantage-theme.<lang>.lmo) and gives
# them the package version instead of one derived from git history.
LUCI_BASENAME:=vantage-theme
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

# Appearance for every browser (Appearance under the colour-theme button)
define Package/luci-theme-vantage/conffiles
/etc/config/vantage_theme
endef

define Package/luci-theme-vantage/postrm
#!/bin/sh
# opkg (24.10) also runs the old package's postrm on an upgrade, as
# "postrm upgrade <new version>": the theme stays then (PKG_UPGRADE too,
# should a package manager mark an upgrade only that way)
[ "$${1:-}" != upgrade ] && [ "$${PKG_UPGRADE:-}" != 1 ] || exit 0
[ -n "$${IPKG_INSTROOT}" ] || {
	# never leave LuCI pointing at a theme that is gone: fall back to
	# Bootstrap when it is registered, else to any other registered theme
	# (LuCI itself also falls back to the first theme that renders)
	if [ "$$(uci -q get luci.main.mediaurlbase)" = "/luci-static/vantage" ]; then
		alt="$$(uci -q get luci.themes.Bootstrap)"
		[ -n "$$alt" ] || alt="$$(uci -q show luci.themes | sed -n "s|^luci\.themes\.[A-Za-z0-9_]*='\(/luci-static/[A-Za-z0-9_.-]*\)'$$|\1|p" | grep -v '^/luci-static/vantage$$' | head -n 1)"
		[ -z "$$alt" ] || uci -q set luci.main.mediaurlbase="$$alt"
	fi
	uci -q delete luci.themes.Vantage
	uci -q commit luci
}
exit 0
endef

# In the LuCI tree (themes/luci-theme-vantage) use $(TOPDIR)/feeds/luci/luci.mk; built from
# an external feed, use the luci feed installed in the build tree.
include $(if $(wildcard $(CURDIR)/$(TOPDIR)/feeds/luci/luci.mk),$(CURDIR)/../../luci.mk,$(TOPDIR)/feeds/luci/luci.mk)

# call BuildPackage - OpenWrt buildroot signature
