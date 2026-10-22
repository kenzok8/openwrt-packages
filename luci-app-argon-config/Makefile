include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-argon-config
PKG_VERSION:=3.0.0
PKG_RELEASE:=20261016
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=Argon configuration compatibility package
LUCI_PKGARCH:=all
# Upgrade this empty package before installing the integrated theme. Keeping
# the dependency unversioned lets an existing theme satisfy this first step.
LUCI_DEPENDS:=+luci-theme-argon

# Save even an unchanged legacy conffile before the empty package releases it.
# The integrated theme consumes this private backup on its first initialization.
define Package/luci-app-argon-config/preinst
#!/bin/sh
root="$${IPKG_INSTROOT}"
if [ ! -f "$$root/usr/share/argon/config-integrated" ] && \
   [ -f "$$root/etc/config/argon" ]; then
	umask 077
	mkdir -p "$$root/etc/argon-config-migration" || exit 1
	cp -p "$$root/etc/config/argon" "$$root/etc/argon-config-migration/argon" || exit 1
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - make this nested recipe visible to OpenWrt package scans.
