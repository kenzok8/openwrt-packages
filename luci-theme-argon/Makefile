#
# Copyright (C) 2008-2019 Jerrykuku
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Argon Theme
LUCI_DEPENDS:=+luci-base +USE_APK:wget-any +!USE_APK:wget +jsonfilter +ucode-mod-math +flock +coreutils-timeout
# Keep existing translation package names and the argon-config message domain.
LUCI_BASENAME:=argon-config
PKG_VERSION:=3.0.0
PKG_RELEASE:=20261016
PKG_LICENSE:=Apache-2.0 MIT

# LuCI derives translations independently of the theme version. Keep release
# builds deterministic even when the package directory has no Git history.
ifneq ($(CONFIG_USE_APK),)
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)
else
# The v3.0.0 IPKs shipped as "unknown", which sorts above numeric versions.
# Keep this prefix for future IPK translations so a normal install upgrades it.
PKG_PO_VERSION:=v$(PKG_VERSION)
endif

CONFIG_LUCI_CSSTIDY:=
# Ship template source across stable and snapshot runtimes. Precompiled
# bytecode would require the SDK's ucode format (see issue #715).
LUCI_MINIFY_UT:=0

define Package/luci-theme-argon/conffiles
/etc/config/argon
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
