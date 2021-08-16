# Copyright (C) 2019  sirpdboy <https://github.com/sirpdboy/luci-app-advanced/>
# 
# This is free software, licensed under the Apache License, Version 2.0 .
# 

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Support for advanced and filebrowser
PKG_VERSION:=1.9

define Package/luci-app-advanced/conffiles
/etc/config/advanced
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
