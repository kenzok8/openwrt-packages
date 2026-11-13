#
# Vantage dashboard for LuCI: a live, read-only overview of the device,
# its uplink, radios, SSIDs and stations. The only write is the station
# alias, stored in /etc/config/vantage (own ACL group).
#
# This is free software, licensed under the GNU General Public License,
# version 3 or (at your option) any later version.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-vantage
PKG_VERSION:=1.0.20
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-or-later

LUCI_TITLE:=Vantage dashboard
LUCI_DESCRIPTION:=Live network dashboard (landing page under admin/dashboard): device, \
	uplink, radios, SSIDs and stations with health and experience scores. \
	Read-only except for station names and stations set not to warn about \
	their signal, which are kept in /etc/config/vantage.
# rpcd-mod-iwinfo provides the station lists and the radios' state
# (iwinfo info/assoclist).
# rpcd-mod-ucode runs the app's plugin (/usr/share/rpcd/ucode/luci.vantage:
# key-free wireless status, thermal zones, validated alias writes), which
# imports the uci, ubus and fs ucode modules; luci-base pulls all four in
# already, they are listed because the plugin needs them. It also imports
# rtnl (the bridges' hosts, the default routes) and nl80211: it reads the
# radios' channel survey (the noise floor) through nl80211 itself, because
# rpcd's iwinfo survey crashes rpcd on drivers other than nl80211's (#124).
# Wi-Fi images already have both, as wifi-scripts needs them.
# Optional at runtime, degrade when absent: rpcd-mod-rrdns (reverse DNS
# names), umdns (mDNS names), hostapd ubus objects (WPS names, client
# capabilities).
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-iwinfo +rpcd-mod-ucode +ucode-mod-uci +ucode-mod-ubus +ucode-mod-fs +ucode-mod-rtnl +ucode-mod-nl80211
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=anothaDev <10740588+anothaDev@users.noreply.github.com>
LUCI_URL:=https://github.com/anothaDev/luci-theme-vantage

# app.css uses custom properties, color-mix() and container queries,
# which csstidy (a CSS2-era minifier) mangles; ship it byte for byte.
LUCI_MINIFY_CSS:=0

# Language packages (po/<lang>/vantage.po) are luci-i18n-vantage-<lang>
# (luci.mk's default name) and carry the package version instead of one
# derived from git history.
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

define Package/luci-app-vantage/conffiles
/etc/config/vantage
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
