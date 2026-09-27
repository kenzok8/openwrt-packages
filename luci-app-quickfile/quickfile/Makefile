#
# Copyright (C) 2015-2016 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=quickfile
PKG_VERSION:=2.0.2
PKG_RELEASE:=1

PKG_SOURCE:=quickfile-src-$(PKG_VERSION).tar.xz
PKG_SOURCE_URL:=https://r2.cooluc.com/source
PKG_HASH:=7619ae7e8139c0b31f99594e4b6ca30298c59d19a7308688d2c0da0f82692c24
PKG_BUILD_DIR:=$(BUILD_DIR)/quickfile-src-$(PKG_VERSION)

PKG_MAINTAINER:=sbwml <admin@cooluc.com>
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:=rust/host
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

define Package/quickfile
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=Web Servers/Proxies
	TITLE:=Quick File Manager
	DEPENDS:=$(RUST_ARCH_DEPENDS) +liblzma
	URL:=https://git.cooluc.com/sbwml/quickfile
endef

define Package/quickfile/description
  A high-performance, lightweight web file manager built with Rust (Axum) and Vue 3,
  featuring an integrated terminal and multimedia preview, tailored for embeddedsystems
  and the OpenWrt ecosystem.
endef

CARGO_PKG_VARS += QUICKFILE_VERSION=v$(PKG_VERSION)-r$(PKG_RELEASE)

define Package/quickfile/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/quickfile $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/etc/init.d $(1)/etc/nginx/conf.d
	$(INSTALL_BIN) $(CURDIR)/files/quickfile.init $(1)/etc/init.d/quickfile
	$(INSTALL_CONF) $(CURDIR)/files/quickfile.locations $(1)/etc/nginx/conf.d/quickfile.locations
endef

$(eval $(call RustBinPackage,quickfile))
$(eval $(call BuildPackage,quickfile))
