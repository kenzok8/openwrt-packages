#
# Carbon — an Apple-style LuCI theme for everyday users
# Licensed under the Apache License, Version 2.0
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Carbon Theme (Apple-style, beginner friendly)
LUCI_DEPENDS:=+luci-base +curl +ca-bundle +flock
LUCI_PKGARCH:=all

PKG_VERSION:=1.1.5
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

# Keep modern CSS/JS intact (csstidy/jsmin do not understand
# backdrop-filter, color-mix() or template literals).
CONFIG_LUCI_CSSTIDY:=
CONFIG_LUCI_JSMIN:=

define Package/luci-theme-carbon/postrm
#!/bin/sh
if [ "$${PKG_UPGRADE}" = 1 ] || [ "$$1" = upgrade ]; then exit 0; fi
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Carbon
	if [ "$$(uci -q get luci.main.mediaurlbase)" = "/luci-static/carbon" ]; then
		if [ -d /www/luci-static/bootstrap ]; then
			uci set luci.main.mediaurlbase=/luci-static/bootstrap
		else
			uci -q delete luci.main.mediaurlbase
		fi
	fi
	uci commit luci
	rm -f /etc/config/carbon
	rm -rf /www/luci-static/carbon/custom
	rmdir /www/luci-static/carbon 2>/dev/null
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
