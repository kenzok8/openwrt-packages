-- Copyright (C) 2021-2022  sirpdboy  <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-lucky 
-- Licensed to the public under the Apache License 2.0.
local SYS  = require "luci.sys"

module("luci.controller.lucky", package.seeall)

function index()
	local e=entry({"admin", "services", "lucky"}, alias("admin", "services", "lucky", "setting"),_("Lucky"), 57)
	e.dependent=false
	e.acl_depends={ "luci-app-lucky" }
	entry({"admin", "services", "lucky", "setting"}, cbi("lucky"), _("Base Setting"), 20).leaf=true
	entry({"admin", "services", "lucky", "lucky"}, template("lucky"), _("Lucky"), 30).leaf = true
	entry({"admin", "services", "lucky_status"}, call("lucky_status"))
	entry({"admin", "services", "lucky_config"}, call("lucky_config"))
end


function lucky_config()	
	local e = { }
	local luckyInfo = SYS.exec("/usr/bin/lucky -info")
	if (luckyInfo~=nil)
	then
		local configObj = ConfigureObj()
		if (configObj~=nil)
		then
			e.BaseConfigure = configObj["BaseConfigure"]
		end
	end
	e.luckyArch = SYS.exec("/usr/bin/luckyarch")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e) 
end 


function lucky_status()
	local e = { }
	e.status = SYS.call("pgrep -f 'lucky -c' >/dev/null") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end


function trim(s)
	return (string.gsub(s, "^%s*(.-)%s*$", "%1"))
end


function ConfigureObj()
	configPath = trim(luci.sys.exec("uci get lucky.@lucky[0].configdir"))
	local configContent = luci.sys.exec("lucky -baseConfInfo -cd "..configPath)
	configObj = luci.jsonc.parse(trim(configContent))
	return configObj
end

