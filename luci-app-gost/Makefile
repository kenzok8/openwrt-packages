# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2025 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for GOST
LUCI_DEPENDS:=+gost

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
$(if $(filter luci-app-gost,$(LUCI_BUILD_PACKAGES)),,$(eval $(call BuildPackage,luci-app-gost)))
