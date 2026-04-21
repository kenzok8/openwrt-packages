include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-subconverter
PKG_VERSION:=1.5.1
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	PKGARCH:=all
	SUBMENU:=3. Applications
	TITLE:=Subconverter
	DEPENDS:=+luci-base +luci +luci-compat
endef

define Package/$(PKG_NAME)/description
	a control panel for subweb and subconverter
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/postinst
    #!/bin/sh
    chmod 755 /etc/subconverter/subconverter
endef

define Package/$(PKG_NAME)/prerm
    #!/bin/sh
    crontab -l | grep -v '/etc/init.d/subconverter' | crontab -
    killall -q /etc/subconverter/subconverter
    rm -rf /etc/subconverter
endef


define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/subconverter
	$(INSTALL_DIR) $(1)/etc/init.d

	$(CP) -r $(TOPDIR)/package/$(PKG_NAME)/* $(PKG_BUILD_DIR)/

	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/controller/subconverter.lua $(1)/usr/lib/lua/luci/controller/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/view/subconverter/subconverter.htm $(1)/usr/lib/lua/luci/view/subconverter
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/view/subconverter/prefini.htm $(1)/usr/lib/lua/luci/view/subconverter
	
	$(CP) -r $(PKG_BUILD_DIR)/root/etc/subconverter $(1)/etc/
	
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/root/etc/init.d/subconverter $(1)/etc/init.d/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
