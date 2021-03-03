include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-bypass
PKG_VERSION:=1.2
PKG_RELEASE:=51

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)/config
config PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks
	bool "Include Shadowsocks-libev"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR
	bool "Include ShadowsocksR-libev"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Server
	bool "Include Shadowsocks Server"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR_Server
	bool "Include ShadowsocksR Server"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs
	bool "Include Shadowsocks Simple-obfs Plugin"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs_server
	bool "Include Shadowsocks Simple-obfs-server Plugin"
	depends on PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Server
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_V2ray_plugin
	bool "Include Shadowsocks V2ray Plugin"
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_V2ray
	bool "Include V2ray"
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Xray
	bool "Include Xray"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Trojan
	bool "Include Trojan"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Trojan-Go
	bool "Include Trojan Go"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_NaiveProxy
	bool "Include NaiveProxy"
	depends on !(arc||armeb||mips||mips64||powerpc)
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Kcptun
	bool "Include Kcptun"
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Socks5_Proxy
	bool "Include Socks5 Transparent Proxy"
	default y

config PACKAGE_$(PKG_NAME)_INCLUDE_Socks_Server
	bool "Include Socks Sever"
	default y
endef

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Server \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR_Server \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs_server \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_V2ray_plugin \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_V2ray \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Xray \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Trojan \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Trojan-Go \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_NaiveProxy \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Kcptun \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Socks5_Proxy \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Socks_Server

define Package/$(PKG_NAME)
 	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=SS/SSR/V2Ray/Xray/Trojan/Trojan-Go/NaiveProxy/Socks5/Tun LuCI interface
	PKGARCH:=all
	DEPENDS:=+ipset +ip-full +iptables-mod-tproxy +dnsmasq-full +smartdns +coreutils +coreutils-base64 +curl +tcping +chinadns-ng +lua +luci-compat +unzip +lua-maxminddb \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Server:shadowsocks-libev-ss-server \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks:shadowsocks-libev-ss-local \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks:shadowsocks-libev-ss-redir \
	+PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR:shadowsocksr-libev-ssr-local \
	+PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR:shadowsocksr-libev-ssr-redir \
	+PACKAGE_$(PKG_NAME)_INCLUDE_ShadowsocksR_Server:shadowsocksr-libev-ssr-server \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs:simple-obfs \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Simple_obfs_server:simple-obfs-server \
	+PACKAGE_$(PKG_NAME)_INCLUDE_V2ray_plugin:v2ray-plugin \
	+PACKAGE_$(PKG_NAME)_INCLUDE_V2ray:v2ray \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Xray:xray-core \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Trojan:trojan-plus \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Trojan-Go:trojan-go \
	+PACKAGE_$(PKG_NAME)_INCLUDE_NaiveProxy:naiveproxy \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Kcptun:kcptun-client \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Socks5_Proxy:redsocks2 \
	+PACKAGE_$(PKG_NAME)_INCLUDE_Socks_Server:microsocks
endef

define Build/Prepare
	$(foreach po,$(wildcard ${CURDIR}/po/zh_Hans/*.po), \
		po2lmo $(po) $(PKG_BUILD_DIR)/$(patsubst %.po,%.lmo,$(notdir $(po)));)
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/bypass
/etc/bypass/
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	cp -pR ./luasrc/* $(1)/usr/lib/lua/luci
	$(INSTALL_DIR) $(1)/
	cp -pR ./root/* $(1)/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/bypass.*.lmo $(1)/usr/lib/lua/luci/i18n/
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ];then
	/etc/init.d/bypass disable
	/etc/init.d/bypass stop
fi
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
