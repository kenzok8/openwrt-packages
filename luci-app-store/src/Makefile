clean:
compile:

include $(TOPDIR)/rules.mk

LUCI_NAME:=luci-lib-dummy
INCLUDE_DIR:=./dummy

include $(TOPDIR)/feeds/luci/luci.mk

install:
	[ -n "$(APP_STORE_VERSION)" ]
	mkdir -p "$(DESTDIR)/www/luci-static" "$(DESTDIR)/etc"
	cp -a "$(FRONTEND_DIST)/luci-static/istore" "$(DESTDIR)/www/luci-static/"
	$(SED) 's#\.js"#.js?v=$(APP_STORE_VERSION)"#g' "$(DESTDIR)/www/luci-static/istore/index.js"
	echo "$(APP_STORE_VERSION)" > "$(DESTDIR)/etc/.app_store.version"
ifneq ($(USE_APK),)
	cp -pR ./root-apk/* "$(DESTDIR)/"
else
	cp -pR ./root-opkg/* "$(DESTDIR)/"
	mkdir -p "$(DESTDIR)/etc/opkg/keys"
	cp -a ./key-build.pub $(DESTDIR)/etc/opkg/keys/`$(STAGING_DIR_HOST)/bin/usign -F -p ./key-build.pub`
endif
	mkdir -p "$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n"
	$(foreach lang,$(LUCI_LANGUAGES),$(foreach po,$(wildcard ${CURDIR}/po/$(lang)/*.po), \
	po2lmo $(po) \
		$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n/$(basename $(notdir $(po))).$(lang).lmo;))
