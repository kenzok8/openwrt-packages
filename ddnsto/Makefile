#
# Copyright (C) 2015-2024 OpenWrt.org
# Copyright (C) 2020 jjm2473@gmail.com
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_ARCH_DDNSTO:=$(ARCH)

PKG_NAME:=ddnsto
# use PKG_SOURCE_DATE instead of PKG_VERSION for compatible
PKG_SOURCE_DATE:=4.2.0
PKG_RELEASE:=1

# 构建类型：standard 或 lite
DDNSTO_TYPE?=standard

# 调试信息
$(info DDNSTO_TYPE is set to: $(DDNSTO_TYPE))

# 架构名称映射
ARCH_HEXCODE:=
ifeq ($(ARCH),x86_64)
ARCH_HEXCODE=8664
else ifeq ($(ARCH),aarch64)
ARCH_HEXCODE=aa64
else ifeq ($(ARCH),arm)
ARCH_HEXCODE=aa32
else ifeq ($(ARCH),mipsel)
ARCH_HEXCODE=1b0c
endif
PKG_SOURCE_VERSION:=$(ARCH_HEXCODE)


# 根据类型选择下载地址和文件名
ifeq ($(DDNSTO_TYPE),lite)
  PKG_SOURCE:=$(PKG_NAME)-binary-lite-$(PKG_SOURCE_DATE).tar.gz
  PKG_SOURCE_URL:=https://github.com/linkease/ddnsto-openwrt-package/raw/refs/heads/main/
  PKG_HASH:=efeca107e0e2086e59dd250d3ffb43f5d772f331cba77b31484773ffb5beb10e
  PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-binary-lite-$(PKG_SOURCE_DATE)
else
  PKG_SOURCE:=$(PKG_NAME)-binary-$(PKG_SOURCE_DATE).tar.gz
  PKG_SOURCE_URL:=https://github.com/linkease/ddnsto-openwrt-package/raw/refs/heads/main/
  PKG_HASH:=be6861b908f6d6ef51d15251f47965fe227f06706948b48f0ad596e012af1419
  PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-binary-$(PKG_SOURCE_DATE)
endif

PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

# 禁用 strip，保持二进制文件原样
STRIP:=true
RSTRIP:=:

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=DDNS.to - the reverse proxy ($(DDNSTO_TYPE))
	DEPENDS:=
	PKGARCH:=all
	URL:=https://www.ddnsto.com/
endef

define Package/$(PKG_NAME)/description
  DDNS.to is a reverse proxy service that allows you to access
  your devices from anywhere without public IP or port forwarding.
  
  Build type: $(DDNSTO_TYPE)
  Features:
  - Multi-device index support
  - WebDAV file sharing
  - Intranet penetration
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/ddnsto
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	[ -f /etc/uci-defaults/ddnsto ] && /etc/uci-defaults/ddnsto && rm -f /etc/uci-defaults/ddnsto
	exit 0
fi
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/sbin $(1)/etc/config $(1)/etc/init.d $(1)/etc/uci-defaults
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/ddnsto.$(PKG_ARCH_DDNSTO) $(1)/usr/sbin/ddnstod
	$(INSTALL_CONF) ./files/ddnsto.config $(1)/etc/config/ddnsto
	$(INSTALL_BIN) ./files/ddnsto.init $(1)/etc/init.d/ddnsto
	$(INSTALL_BIN) ./files/ddnsto.uci-default $(1)/etc/uci-defaults/ddnsto
	$(LN) /usr/sbin/ddnstod $(1)/usr/sbin/ddnsto
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
