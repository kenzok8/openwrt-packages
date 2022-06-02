clean:
compile:

include $(TOPDIR)/rules.mk

LUCI_NAME:=luci-lib-dummy
INCLUDE_DIR:=./dummy

include $(TOPDIR)/feeds/luci/luci.mk

install:
	mkdir -p "$(DESTDIR)/www/luci-static"
	cp -a "$(FRONTEND_DIST)/luci-static/istore" "$(DESTDIR)/www/luci-static/"
	$(SED) 's#\.js"#.js?v=$(APP_STORE_VERSION)"#g' "$(DESTDIR)/www/luci-static/istore/index.js"
	mkdir -p "$(DESTDIR)/etc"
	echo "$(APP_STORE_VERSION)" > "$(DESTDIR)/etc/.app_store.version"
	mkdir -p "$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n"
	$(foreach lang,$(LUCI_LANGUAGES),$(foreach po,$(wildcard ${CURDIR}/po/$(lang)/*.po), \
	po2lmo $(po) \
		$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n/$(basename $(notdir $(po))).$(lang).lmo;))
