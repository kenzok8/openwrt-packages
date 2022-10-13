include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-vssr
PKG_VERSION:=1.25
PKG_RELEASE:=20220423

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Xray \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Trojan \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Kcptun \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Xray_plugin \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR_Libev_Server \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria

LUCI_TITLE:=A New SS/SSR/Xray/Trojan LuCI interface
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+ipset +ip-full +iptables-mod-tproxy +dnsmasq-full +coreutils +coreutils-base64 +bash +pdnsd-alt +wget-ssl +lua +luasocket +lua-maxminddb +lua-cjson \
	+shadowsocks-libev-ss-local +shadowsocks-libev-ss-redir +shadowsocksr-libev-ssr-local +shadowsocksr-libev-ssr-redir +shadowsocksr-libev-ssr-check +simple-obfs

define Package/$(PKG_NAME)/config
	if PACKAGE_$(PKG_NAME)
		menu "VSSR Configuration"
			config PACKAGE_$(PKG_NAME)_INCLUDE_Xray
				bool "Include Xray"
				select PACKAGE_xray-core
				default y if i386||x86_64||arm||aarch64

			config PACKAGE_$(PKG_NAME)_INCLUDE_Trojan
				bool "Include Trojan"
				select PACKAGE_ipt2socks
				select PACKAGE_trojan
				default y if i386||x86_64||arm||aarch64

			config PACKAGE_$(PKG_NAME)_INCLUDE_Kcptun
				bool "Include Kcptun"
				select PACKAGE_kcptun-client
				default n

			config PACKAGE_$(PKG_NAME)_INCLUDE_Xray_plugin
				bool "Include Shadowsocks Xray Plugin"
				select PACKAGE_xray-plugin
				default y if i386||x86_64||arm||aarch64

			config PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR_Libev_Server
				bool "Include ShadowsocksR Libev Server"
				select PACKAGE_shadowsocksr-libev-ssr-server
				default y if i386||x86_64||arm||aarch64

			config PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria
				bool "Include Hysteria"
				select PACKAGE_hysteria
				default y if i386||x86_64||arm||aarch64
		endmenu
	endif
endef

define Package/$(PKG_NAME)/conffiles
/etc/vssr/
/etc/config/vssr
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
