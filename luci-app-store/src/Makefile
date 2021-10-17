clean:
compile:
install:
	mkdir -p "$(DESTDIR)/www/luci-static"
	cp -a "$(FRONTEND_DIST)/luci-static/istore" "$(DESTDIR)/www/luci-static/"
	mkdir -p "$(DESTDIR)/etc"
	echo "$(APP_STORE_VERSION)" > "$(DESTDIR)/etc/.app_store.version"
