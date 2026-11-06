# luci-app-openclaw — OpenWrt LuCI plugin for OpenClaw AI Gateway
# 同时兼容 luci 24.10+（JS view）与 18.06（Lua CBI），可作为 feeds 源或放进 package/

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-openclaw
PKG_VERSION:=2026.05.22.3
PKG_RELEASE:=1

# 状态页与升级检测读这个文件；打包时按 PKG_VERSION 生成，仓库里不存副本
define Build/Prepare
	echo '$(PKG_VERSION)' > ./root/usr/share/openclaw/VERSION
endef

PKG_MAINTAINER:=kenzok8
PKG_LICENSE:=GPL-3.0

LUCI_TITLE:=OpenClaw AI Gateway
LUCI_DEPENDS:=+luci-compat +luci-base +curl +openssl-util
LUCI_PKGARCH:=all

# 安装清单、i18n、文件权限都交给 luci.mk，不再自己维护一份
LUCI_MK:=$(firstword $(wildcard $(TOPDIR)/feeds/luci/luci.mk))
ifeq ($(LUCI_MK),)
  $(error luci.mk not found: 需要 feeds/luci（例如 git clone https://github.com/openwrt/luci feeds/luci）)
endif
include $(LUCI_MK)

define Package/$(PKG_NAME)/conffiles
/etc/config/openclaw
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	( . /etc/uci-defaults/99-openclaw ) && rm -f /etc/uci-defaults/99-openclaw
	rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null
	exit 0
}
endef

$(if $(filter $(PKG_NAME),$(LUCI_BUILD_PACKAGES)),,$(eval $(call BuildPackage,$(PKG_NAME))))
