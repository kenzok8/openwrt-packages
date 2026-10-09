#
# Copyright (C) 2008-2019 Jerrykuku
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Argon Theme
LUCI_DEPENDS:=+USE_APK:wget-any +!USE_APK:wget +jsonfilter
PKG_VERSION:=2.4.8
PKG_RELEASE:=20261009

CONFIG_LUCI_CSSTIDY:=
# Ship template source across stable and snapshot runtimes. Precompiled
# bytecode would require the SDK's ucode format (see issue #715).
LUCI_MINIFY_UT:=0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
