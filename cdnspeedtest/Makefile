# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2021 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=CloudflareSpeedTest
PKG_VERSION:=2.0.2
PKG_RELEASE:=$(AUTORELEASE)

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/XIU2/CloudflareSpeedTest/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=skip

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILE:=LICENSE
PKG_MAINTAINER:=Tianling Shen <cnsztl@immortalwrt.org>

PKG_CONFIG_DEPENDS:= \
	CONFIG_CDNSPEEDTEST_COMPRESS_GOPROXY \
	CONFIG_CDNSPEEDTEST_COMPRESS_UPX

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

GO_PKG:=CloudflareSpeedTest
GO_PKG_LDFLAGS:=-s -w
GO_PKG_LDFLAGS_X:=main.version=v$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/cdnspeedtest
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Getting the fastest ips to your network of CDN
  URL:=https://github.com/XIU2/CloudflareSpeedTest
  DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/cdnspeedtest/config
config CDNSPEEDTEST_COMPRESS_GOPROXY
	bool "Compiling with GOPROXY proxy"
	default n

config CDNSPEEDTEST_COMPRESS_UPX
	bool "Compress executable files with UPX"
	depends on !mips64
	default n
endef

ifeq ($(CONFIG_CDNSPEEDTEST_COMPRESS_GOPROXY),y)
	export GO111MODULE=on
	export GOPROXY=https://goproxy.bj.bcebos.com
endif

define Build/Compile
	$(call GoPackage/Build/Compile)
ifeq ($(CONFIG_CDNSPEEDTEST_COMPRESS_UPX),y)
	$(STAGING_DIR_HOST)/bin/upx --lzma --best $(GO_PKG_BUILD_BIN_DIR)/CloudflareSpeedTest
endif
endef

define Package/cdnspeedtest/install
	$(call GoPackage/Package/Install/Bin,$(PKG_INSTALL_DIR))
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/CloudflareSpeedTest $(1)/usr/bin/cdnspeedtest

	$(INSTALL_DIR) $(1)/usr/share/CloudflareSpeedTest
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/ip.txt $(1)/usr/share/CloudflareSpeedTest/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/ipv6.txt $(1)/usr/share/CloudflareSpeedTest/
endef

$(eval $(call BuildPackage,cdnspeedtest))
