clean:
compile:

include $(TOPDIR)/rules.mk

LUCI_NAME:=luci-lib-dummy
INCLUDE_DIR:=./dummy

include $(TOPDIR)/feeds/luci/luci.mk

install:
	mkdir -p "$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n"
	$(foreach lang,$(LUCI_LANGUAGES),$(foreach po,$(wildcard ${CURDIR}/po/$(lang)/*.po), \
	po2lmo $(po) \
		$(DESTDIR)$(LUCI_LIBRARYDIR)/i18n/$(basename $(notdir $(po))).$(lang).lmo;))
