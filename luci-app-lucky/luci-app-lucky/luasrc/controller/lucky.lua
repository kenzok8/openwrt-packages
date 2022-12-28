-- Copyright (C) 2021-2022  sirpdboy  <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-lucky 
-- Licensed to the public under the Apache License 2.0.

module("luci.controller.lucky", package.seeall)

function index()

	entry({"admin", "services", "lucky"}, alias("admin", "services", "lucky", "setting"),_("Lucky"), 57).dependent = true
	entry({"admin", "services", "lucky", "setting"}, cbi("lucky"), _("Base Setting"), 20).leaf=true
	entry({"admin", "services", "lucky", "lucky"}, template("lucky"), _("Lucky"), 30).leaf = true
	entry({"admin", "services", "lucky", "lucky_admin"}, call("lucky_admin")).leaf = true
	entry({"admin", "services", "lucky_status"}, call("act_status"))
end

function act_status()
	local uci = require 'luci.model.uci'.cursor()
	local port = tonumber(uci:get_first("lucky", "lucky", "port"))
	local e = { }
	e.running = luci.sys.call("pidof lucky >/dev/null") == 0
	e.port = (port or 16601)
	e.safeurl = luci.sys.exec("cat /etc/lucky/lucky.conf | grep SafeURL | sed -e 's/,//g' -e 's/\"//g'  -e 's/\ //g' | awk -F ':' '{print $2}'  ")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function lucky_admin()
	local e = { }
	e.username = luci.sys.exec("cat /etc/lucky/lucky.conf | grep AdminAccount | sed -e 's/,//g' -e 's/\"//g' | awk -F ':' '{print $2}' ")
	e.password = luci.sys.exec("cat /etc/lucky/lucky.conf | grep AdminPassword | sed -e 's/,//g' -e 's/\"//g' | awk -F ':' '{print $2}' ")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
