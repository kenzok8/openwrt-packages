# SPDX-License-Identifier: Apache-2.0

include $(TOPDIR)/rules.mk
include $(INCLUDE_DIR)/version.mk

PKG_NAME:=luci-app-lucky
PKG_VERSION:=3.0.0
PKG_RELEASE:=30
LUCKY_ASSET_VERSION:=$(subst .,_,$(PKG_VERSION))-$(PKG_RELEASE)
LUCKY_VIEW_NAME:=config-$(LUCKY_ASSET_VERSION)

LUCI_TITLE:=LuCI support for Lucky
LUCI_DESCRIPTION:=Manage the Lucky service and its basic web settings.
LUCI_DEPENDS:=+lucky +rpcd-mod-file +lua +libubus-lua +libuci-lua +luci-lib-nixio +luci-lib-jsonc +luci-lib-ip
LUCI_PKGARCH:=all

# Keep Windows checkout permissions out of the installed package.
define LuckyPrepareFiles
	find $(PKG_BUILD_DIR)/root $(PKG_BUILD_DIR)/htdocs -type d -exec chmod 0755 {} +
	find $(PKG_BUILD_DIR)/root $(PKG_BUILD_DIR)/htdocs -type f -exec chmod 0644 {} +
	chmod 0755 $(PKG_BUILD_DIR)/root/usr/libexec/lucky-backup
	chmod 0755 $(PKG_BUILD_DIR)/root/usr/libexec/lucky-diagnostics
	chmod 0755 $(PKG_BUILD_DIR)/root/usr/libexec/lucky-luci-refresh
	# Version every asset: old LuCI/uhttpd may retain CSS and adapter scripts
	# independently of the main view, including when a query string is reused.
	for asset in config.js config.css legacy.js legacy.css; do \
		mv $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/lucky/$$$$asset \
			$(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/lucky/$$$${asset%.*}-$(LUCKY_ASSET_VERSION).$$$${asset##*.}; \
	done
	sed -i 's|"lucky/config"|"lucky/$(LUCKY_VIEW_NAME)"|g' \
		$(PKG_BUILD_DIR)/root/usr/share/luci/menu.d/luci-app-lucky.json \
		$(PKG_BUILD_DIR)/root/usr/lib/lua/luci/controller/lucky.lua \
		$(PKG_BUILD_DIR)/root/usr/lib/lua/luci/view/lucky/legacy.htm
	sed -i 's|lucky/config.css|lucky/$(LUCKY_VIEW_NAME).css|g' \
		$(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/lucky/$(LUCKY_VIEW_NAME).js
	sed -i 's|lucky/legacy.js|lucky/legacy-$(LUCKY_ASSET_VERSION).js|g' \
		$(PKG_BUILD_DIR)/root/usr/lib/lua/luci/view/lucky/legacy.htm \
		$(PKG_BUILD_DIR)/root/usr/lib/lua/luci/lucky_legacy.lua
	sed -i 's|lucky/legacy.css|lucky/legacy-$(LUCKY_ASSET_VERSION).css|g' \
		$(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/lucky/legacy-$(LUCKY_ASSET_VERSION).js
endef
Hooks/Prepare/Post += LuckyPrepareFiles

ifneq ($(filter 19.07%,$(VERSION_NUMBER)),)
  LUCI_DEPENDS+=+luci-compat
endif

define Package/luci-app-lucky/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/usr/libexec/lucky-luci-refresh
fi
exit 0
endef

# Keep the canonical catalog in po/zh_Hans. Older Lean/LEDE luci.mk has no
# language aliases and would generate an unselected, unusable zh_Hans package.
# This recursive variable is evaluated after luci.mk defines its aliases.
override LUCI_LANGUAGES = $(if $(LUCI_LC_ALIAS.zh_Hans),zh_Hans)

# Newer base-files runs and removes uci-defaults before postinst-pkg. Old
# luci.mk unconditionally sources the removed file, so keep this fallback
# idempotent while still registering the language on older firmware.
override define Package/luci-i18n-lucky-zh-cn/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
defaults=/etc/uci-defaults/luci-i18n-lucky-zh-cn
[ -f "$$defaults" ] || exit 0
(. "$$defaults") && rm -f "$$defaults"
endef

include $(TOPDIR)/feeds/luci/luci.mk

ifeq ($(LUCI_LC_ALIAS.zh_Hans),)
  $(eval $(call LuciTranslation,zh-cn))

  define Package/luci-i18n-lucky-zh-cn/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults $(1)$(LUCI_LIBRARYDIR)/i18n
	echo "uci set luci.languages.zh_cn='$(LUCI_LANG.zh-cn)'; uci commit luci" \
		> $(1)/etc/uci-defaults/luci-i18n-lucky-zh-cn
	po2lmo $(CURDIR)/po/zh_Hans/lucky.po $(1)$(LUCI_LIBRARYDIR)/i18n/lucky.zh-cn.lmo
  endef

  $(eval $(call BuildPackage,luci-i18n-lucky-zh-cn))
endif

# call BuildPackage - OpenWrt buildroot signature
