#
# Copyright (C) 2015-2016 OpenWrt.org
# Copyright (C) 2020 jjm2473@gmail.com
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_ARCH_quickstart:=$(ARCH)

PKG_NAME:=quickstart
PKG_VERSION:=0.9.6
PKG_RELEASE:=1
PKG_SOURCE:=$(PKG_NAME)-binary-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/linkease/istore-packages/releases/download/prebuilt/
PKG_HASH:=5c4d191d81651338f6560bbf78f5f2bb5729ba293844dfe24d3a41bd7aca6e8d

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-binary-$(PKG_VERSION)

PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=Quickstart, the quick start.
	DEPENDS:=@(x86_64||aarch64||arm) +shadow-utils +shadow-useradd +mount-utils +block-mount +lsblk +e2fsprogs +parted +smartmontools +smartd +mdadm +ip-full +ubus +uci +bash
	URL:=https://easepi.linkease.com/
endef

define Package/$(PKG_NAME)/description
  Quickstart is a dashboard & user guide
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/quickstart
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	if [ -f /etc/uci-defaults/09-quickstart ]; then
		chmod 755 /etc/uci-defaults/09-quickstart
		/etc/uci-defaults/09-quickstart && rm -f /etc/uci-defaults/09-quickstart
	fi
	exit 0
fi
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/sbin $(1)/etc/init.d $(1)/etc/uci-defaults $(1)/etc/hotplug.d/block $(1)/etc/config $(1)/usr/libexec/quickstart
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/quickstart.$(PKG_ARCH_quickstart) $(1)/usr/sbin/quickstart
	$(INSTALL_BIN) ./files/quickstart.init $(1)/etc/init.d/quickstart
	$(INSTALL_BIN) ./files/quickstart.uci-default $(1)/etc/uci-defaults/09-quickstart
	$(INSTALL_BIN) ./files/quickstart.hotplug $(1)/etc/hotplug.d/block/09-quickstart
	$(INSTALL_CONF) ./files/quickstart.config $(1)/etc/config/quickstart
	$(INSTALL_BIN) ./files/dhcpvalid.sh $(1)/usr/libexec/quickstart/dhcpvalid.sh
	$(INSTALL_BIN) ./files/startdhns.init $(1)/etc/init.d/startdhns
	$(LN) /usr/sbin/quickstart $(1)/usr/sbin/startdhns
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./files/startdhns.hotplug $(1)/etc/hotplug.d/iface/21-startdhns
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
