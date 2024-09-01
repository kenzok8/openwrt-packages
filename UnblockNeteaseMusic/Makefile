include $(TOPDIR)/rules.mk

PKG_NAME:=UnblockNeteaseMusic
PKG_VERSION:=0.27.8-patch.1
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/UnblockNeteaseMusic/server/tar.gz/v${PKG_VERSION}?
PKG_HASH:=96b36e094614abaede3651286c26f5ca4aef1da684e1936f5678f527231906ef

PKG_SOURCE_SUBDIR:=$(PKG_NAME)
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_SOURCE_SUBDIR)
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/UnblockNeteaseMusic
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=Revive Netease Cloud Music (NodeJS)
  URL:=https://github.com/nondanee/UnblockNeteaseMusic
  DEPENDS:=+node
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
Revive Netease Cloud Music (NodeJS)
endef

define Build/Prepare
	tar -xzvf $(DL_DIR)/$(PKG_SOURCE) -C $(PKG_BUILD_DIR)
	mkdir -p $(PKG_BUILD_DIR)/$(PKG_NAME)
	echo -e $(PKG_VERSION) > $(PKG_BUILD_DIR)/$(PKG_NAME)/core_ver
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/share/$(PKG_NAME)
	$(CP) $(PKG_BUILD_DIR)/$(PKG_NAME)/* $(1)/usr/share/$(PKG_NAME)
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
