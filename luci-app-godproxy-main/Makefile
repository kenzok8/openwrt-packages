include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-godproxy
PKG_VERSION:=3.8.5
PKG_RELEASE:=3-20210421

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-godproxy
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=LuCI support for koolproxy
	DEPENDS:=+openssl-util +ipset +dnsmasq-full +@BUSYBOX_CONFIG_DIFF +iptables-mod-nat-extra +wget
	MAINTAINER:=panda-mute <wxuzju@gmail.com>
endef

define Build/Compile
endef

define Package/luci-app-godproxy/conffiles
	/etc/config/koolproxy
	/usr/share/koolproxy/data/rules/
endef

define Package/luci-app-godproxy/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	cp -pR ./luasrc/* $(1)/usr/lib/lua/luci
	$(INSTALL_DIR) $(1)/
	cp -pR ./root/* $(1)/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	po2lmo ./po/zh-cn/koolproxy.po $(1)/usr/lib/lua/luci/i18n/koolproxy.zh-cn.lmo

ifeq ($(ARCH),mipsel)
	$(INSTALL_BIN) ./bin/mipsel $(1)/usr/share/koolproxy/koolproxy
endif
ifeq ($(ARCH),mips)
	$(INSTALL_BIN) ./bin/mips $(1)/usr/share/koolproxy/koolproxy
endif
ifeq ($(ARCH),x86)
	$(INSTALL_BIN) ./bin/x86 $(1)/usr/share/koolproxy/koolproxy
endif
ifeq ($(ARCH),x86_64)
	$(INSTALL_BIN) ./bin/x86_64 $(1)/usr/share/koolproxy/koolproxy
endif
ifeq ($(ARCH),arm)
	$(INSTALL_BIN) ./bin/arm $(1)/usr/share/koolproxy/koolproxy
endif
ifeq ($(ARCH),aarch64)
	$(INSTALL_BIN) ./bin/aarch64 $(1)/usr/share/koolproxy/koolproxy
endif
endef

define Package/luci-app-godproxy/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	( . /etc/uci-defaults/luci-koolproxy ) && rm -f /etc/uci-defaults/luci-koolproxy
	rm -f /tmp/luci-indexcache
fi
exit 0
endef

$(eval $(call BuildPackage,luci-app-godproxy))
