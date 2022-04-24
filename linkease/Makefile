#
# Copyright (C) 2015-2016 OpenWrt.org
# Copyright (C) 2020 jjm2473@gmail.com
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_ARCH_LINKEASE:=$(ARCH)

PKG_NAME:=linkease
PKG_VERSION:=0.7.0
PKG_RELEASE:=1
PKG_SOURCE:=$(PKG_NAME)-binary-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=http://fw.koolcenter.com/binary/LinkEase/LinuxStorage/
PKG_HASH:=26ebbb22d78fd2ceb009226a0d85a40f100d502595b59c8a43eea5e4394ee292

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-binary-$(PKG_VERSION)

PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=LinkEase - the file cloud
	DEPENDS:=@(arm||x86_64||aarch64)
	URL:=https://www.ddnsto.com/linkease/
endef

define Package/$(PKG_NAME)/description
  LinkEase is a file cloud
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/linkease
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	[ -f /etc/uci-defaults/linkease ] && /etc/uci-defaults/linkease && rm -f /etc/uci-defaults/linkease
fi
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/sbin/linkease-plugins $(1)/etc/config $(1)/etc/init.d $(1)/etc/uci-defaults
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/linkease.$(PKG_ARCH_LINKEASE) $(1)/usr/sbin/linkease
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/heif-converter.$(PKG_ARCH_LINKEASE) $(1)/usr/sbin/heif-converter
	$(INSTALL_BIN) ./files/linkease-config.sh $(1)/usr/sbin/linkease-config.sh
	$(INSTALL_BIN) ./files/aria2.sh $(1)/usr/sbin/linkease-plugins/aria2.sh
	$(INSTALL_CONF) ./files/linkease.config $(1)/etc/config/linkease
	$(INSTALL_BIN) ./files/linkease.init $(1)/etc/init.d/linkease
	$(INSTALL_BIN) ./files/linkease.uci-default $(1)/etc/uci-defaults/linkease
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
