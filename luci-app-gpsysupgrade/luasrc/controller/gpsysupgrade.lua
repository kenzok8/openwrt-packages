-- Copyright (C) 2018-2020 L-WRT Team
module("luci.controller.gpsysupgrade", package.seeall)
local appname = "gpsysupgrade"
local ucic = luci.model.uci.cursor()
local http = require "luci.http"
local util = require "luci.util"
local sysupgrade = require "luci.model.cbi.gpsysupgrade.sysupgrade"

function index()
	appname = "gpsysupgrade"
	entry({"admin", "services", appname}).dependent = true
	entry({"admin", "services", appname}, template("gpsysupgrade/system_version"), _("System upgrade"), 1)
	entry({"admin", "services", appname, "sysversion_check"}, call("sysversion_check")).leaf = true
	entry({"admin", "services", appname, "sysversion_update"}, call("sysversion_update")).leaf = true
end

local function http_write_json(content)
	http.prepare_content("application/json")
	http.write_json(content or {code = 1})
end


function sysversion_check()
	local json = sysupgrade.to_check("")
	http_write_json(json)
end

function sysversion_update()
	local json = nil
	local task = http.formvalue("task")
	if task == "flash" then
		json = sysupgrade.to_flash(http.formvalue("file"),http.formvalue("retain"))
	else
		json = sysupgrade.to_download(http.formvalue("url"))
	end

	http_write_json(json)
end
