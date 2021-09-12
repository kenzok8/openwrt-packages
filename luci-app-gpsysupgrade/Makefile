# This is free software, licensed under the Apache License, Version 2.0 .

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for sysupgrade
LUCI_DEPENDS:=+luci-base
PKG_MAINTAINER:=GaryPang <garyp@qq.com>

define Package/luci-theme-edge/postinst
  #!/bin/sh
  rm -Rf /var/luci-*cache*
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
