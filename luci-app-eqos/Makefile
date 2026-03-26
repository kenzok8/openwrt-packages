include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-eqos
PKG_VERSION:=2.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=kenzok78 <admin@kenzok78.com>
PKG_LICENSE:=GPL-2.0

LUCI_TITLE:=LuCI support for EQOS
LUCI_DEPENDS:=+luci-base +tc +kmod-sched-core +kmod-ifb
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-eqos/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/etc/config/eqos $(1)/etc/config/eqos
	$(INSTALL_BIN) ./files/etc/init.d/eqos $(1)/etc/init.d/eqos
	$(INSTALL_BIN) ./files/etc/hotplug.d/iface/10-eqos $(1)/etc/hotplug.d/iface/10-eqos
	$(INSTALL_BIN) ./files/usr/sbin/eqos $(1)/usr/sbin/eqos
endef

$(eval $(call BuildPackage,luci-app-eqos))
