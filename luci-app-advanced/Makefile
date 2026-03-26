# Copyright (C) 2019  sirpdboy <https://github.com/sirpdboy/luci-app-advanced/>
# Maintained by kenzok78
#
# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-advanced
PKG_VERSION:=1.20
PKG_RELEASE:=1
PKG_MAINTAINER:=kenzok78 <https://github.com/kenzok78>

LUCI_TITLE:=LuCI Support for Advanced Settings and File Manager
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/install
	$(call Package/$(PKG_NAME)/install/default,$(1))

	$(INSTALL_DIR) $(1)/bin
	$(INSTALL_BIN) ./root/bin/* $(1)/bin/
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
$(eval $(call BuildPackage,$(PKG_NAME)))
