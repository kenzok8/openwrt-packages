require("luci.sys")
require("luci.util")
require("io")

local m, s, o, o1
local fs = require "nixio.fs"
local uci = require "luci.model.uci".cursor()

local configpath = uci:get("AdGuardHome", "AdGuardHome", "configpath") or "/etc/AdGuardHome.yaml"
local binpath = uci:get("AdGuardHome", "AdGuardHome", "binpath") or "/usr/bin/AdGuardHome"
local httpport = uci:get("AdGuardHome", "AdGuardHome", "httpport") or "3000"

m = Map("AdGuardHome", "AdGuard Home")
m.description = translate("Free and open source, powerful network-wide ads & trackers blocking DNS server.")
m:section(SimpleSection).template = "AdGuardHome/AdGuardHome_status"

s = m:section(TypedSection, "AdGuardHome")
s.anonymous = true
s.addremove = false

o = s:option(Flag, "enabled", translate("Enable"))
o.default = "0"
o.optional = false

o = s:option(Value, "httpport", translate("Browser management port"))
o.placeholder = "3000"
o.default = "3000"
o.datatype = "port"
o.optional = false
o.description = translate("<input type=\"button\" style=\"width:210px;border-color:Teal;text-align:center;font-weight:bold;color:Green;\" value=\"AdGuardHome Web:" .. httpport .. "\" onclick=\"window.open('http://'+window.location.hostname+':" .. httpport .. "/')\"/>")

local binmtime = uci:get("AdGuardHome", "AdGuardHome", "binmtime") or "0"
local version_info = ""

if not fs.access(configpath) then
	version_info = translate("no config")
end

if not fs.access(binpath) then
	version_info = version_info .. " " .. translate("no core")
else
	local version = uci:get("AdGuardHome", "AdGuardHome", "version")
	local testtime = fs.stat(binpath, "mtime")
	if testtime ~= tonumber(binmtime) or not version then
		local tmp = luci.sys.exec(binpath .. " --version 2>/dev/null | grep -oE 'v[0-9.]+' | head -1")
		version = tmp:match("v[0-9.]+") or "core error"
		if version == "core error" or version == "" then
			version = "core error"
		end
		uci:set("AdGuardHome", "AdGuardHome", "version", version)
		uci:set("AdGuardHome", "AdGuardHome", "binmtime", testtime)
		uci:save("AdGuardHome")
	end
	version_info = version .. version_info
end

o = s:option(Button, "restart", translate("Update"))
o.inputtitle = translate("Update core version")
o.template = "AdGuardHome/AdGuardHome_check"
o.showfastconfig = not fs.access(configpath)
o.description = string.format(translate("core version:") .. "<strong><font id=\"updateversion\" color=\"green\">%s</font></strong>", version_info)

local port = luci.sys.exec("awk '/^  port:/{print $2;exit}' " .. configpath .. " 2>/dev/null")
if not port or port == "" then
	port = "?"
end

o = s:option(ListValue, "redirect", port .. translate("Redirect"), translate("AdGuardHome redirect mode"))
o.placeholder = "none"
o:value("none", translate("none"))
o:value("dnsmasq-upstream", translate("Run as dnsmasq upstream server"))
o:value("redirect", translate("Redirect 53 port to AdGuardHome"))
o:value("exchange", translate("Use port 53 replace dnsmasq"))
o.default = "none"
o.optional = true

o = s:option(Value, "binpath", translate("Bin Path"), translate("AdGuardHome Bin path if no bin will auto download"))
o.default = "/usr/bin/AdGuardHome"
o.datatype = "string"
o.optional = false
o.rmempty = false
o.validate = function(self, value)
	if value == "" then return nil end
	if fs.stat(value, "type") == "dir" then
		fs.rmdir(value)
	end
	if fs.stat(value, "type") == "dir" then
		m.message = (m.message or "") .. "\nerror: bin path is a directory"
		return nil
	end
	return value
end

o = s:option(ListValue, "upxflag", translate("use upx to compress bin after download"))
o:value("", translate("none"))
o:value("-1", translate("compress faster"))
o:value("-9", translate("compress better"))
o:value("--best", translate("compress best(can be slow for big files)"))
o:value("--brute", translate("try all available compression methods & filters [slow]"))
o:value("--ultra-brute", translate("try even more compression variants [very slow]"))
o.default = ""
o.description = translate("bin use less space,but may have compatibility issues")
o.rmempty = true

o = s:option(Value, "configpath", translate("Config Path"), translate("AdGuardHome config path"))
o.default = "/etc/AdGuardHome.yaml"
o.datatype = "string"
o.optional = false
o.rmempty = false
o.validate = function(self, value)
	if not value then return nil end
	if fs.stat(value, "type") == "dir" then
		fs.rmdir(value)
	end
	if fs.stat(value, "type") == "dir" then
		m.message = (m.message or "") .. "\nerror: config path is a directory"
		return nil
	end
	return value
end

o = s:option(Value, "workdir", translate("Work dir"), translate("AdGuardHome work dir include rules,audit log and database"))
o.default = "/etc/AdGuardHome"
o.datatype = "string"
o.optional = false
o.rmempty = false
o.validate = function(self, value)
	if value == "" then return nil end
	if fs.stat(value, "type") == "reg" then
		m.message = (m.message or "") .. "\nerror: work dir is a file"
		return nil
	end
	if value:sub(-1) == "/" then
		return value:sub(1, -2)
	end
	return value
end

o = s:option(Value, "logfile", translate("Runtime log file"), translate("AdGuardHome runtime Log file if 'syslog': write to system log;if empty no log"))
o.datatype = "string"
o.rmempty = true
o.validate = function(self, value)
	if value and value ~= "" and fs.stat(value, "type") == "dir" then
		fs.rmdir(value)
	end
	if value and value ~= "" and fs.stat(value, "type") == "dir" then
		m.message = (m.message or "") .. "\nerror: log file is a directory"
		return nil
	end
	return value
end

o = s:option(Flag, "verbose", translate("Verbose log"))
o.default = "0"
o.optional = true

local gfw_status
if fs.access(configpath) and luci.sys.call("grep -q 'programaddstart' " .. configpath .. " 2>/dev/null") == 0 then
	gfw_status = translate("Added")
else
	gfw_status = translate("Not added")
end

o = s:option(Button, "gfwdel", translate("Del gfwlist"), gfw_status)
o.optional = true
o.inputtitle = translate("Del")
o.write = function()
	luci.sys.exec("sh /usr/share/AdGuardHome/gfw2adg.sh del 2>&1")
	luci.http.redirect(luci.dispatcher.build_url("admin", "services", "AdGuardHome"))
end

o = s:option(Button, "gfwadd", translate("Add gfwlist"), gfw_status)
o.optional = true
o.inputtitle = translate("Add")
o.write = function()
	luci.sys.exec("sh /usr/share/AdGuardHome/gfw2adg.sh 2>&1")
	luci.http.redirect(luci.dispatcher.build_url("admin", "services", "AdGuardHome"))
end

o = s:option(Value, "gfwupstream", translate("Gfwlist upstream dns server"), translate("Gfwlist domain upstream dns service") .. " (" .. gfw_status .. ")")
o.default = "tcp://208.67.220.220:5353"
o.datatype = "string"
o.optional = true

o = s:option(Value, "hashpass", translate("Change browser management password"), translate("Press load culculate model and culculate finally save/apply"))
o.default = ""
o.datatype = "string"
o.template = "AdGuardHome/AdGuardHome_chpass"
o.optional = true

o = s:option(MultiValue, "upprotect", translate("Keep files when system upgrade"))
o:value("$binpath", translate("core bin"))
o:value("$configpath", translate("config file"))
o:value("$logfile", translate("log file"))
o:value("$workdir/data/sessions.db", translate("sessions.db"))
o:value("$workdir/data/stats.db", translate("stats.db"))
o:value("$workdir/data/querylog.json", translate("querylog.json"))
o:value("$workdir/data/filters", translate("filters"))
o.widget = "checkbox"
o.default = nil
o.optional = true

o = s:option(Flag, "waitonboot", translate("On boot when network ok restart"))
o.default = "1"
o.optional = true

local workdir = uci:get("AdGuardHome", "AdGuardHome", "workdir") or "/etc/AdGuardHome"
o = s:option(MultiValue, "backupfile", translate("Backup workdir files when shutdown"))
o1 = s:option(Value, "backupwdpath", translate("Backup workdir path"))
local name

o:value("filters", "filters")
o:value("stats.db", "stats.db")
o:value("querylog.json", "querylog.json")
o:value("sessions.db", "sessions.db")

o1:depends("backupfile", "filters")
o1:depends("backupfile", "stats.db")
o1:depends("backupfile", "querylog.json")
o1:depends("backupfile", "sessions.db")

if fs.access(workdir .. "/data") then
	for name in fs.glob(workdir .. "/data/*") do
		local basename = fs.basename(name)
		if basename ~= "filters" and basename ~= "stats.db" and basename ~= "querylog.json" and basename ~= "sessions.db" then
			o:value(basename, basename)
			o1:depends("backupfile", basename)
		end
	end
end

o.widget = "checkbox"
o.default = nil
o.optional = false
o.description = translate("Will be restore when workdir/data is empty")

o1.default = "/etc/AdGuardHome"
o1.datatype = "string"
o1.optional = false
o1.validate = function(self, value)
	if value and value ~= "" and fs.stat(value, "type") == "reg" then
		m.message = (m.message or "") .. "\nerror: backup dir is a file"
		return nil
	end
	if value and value:sub(-1) == "/" then
		return value:sub(1, -2)
	end
	return value
end

o = s:option(MultiValue, "crontab", translate("Crontab task"), translate("Please change time and args in crontab"))
o:value("autoupdate", translate("Auto update core"))
o:value("cutquerylog", translate("Auto tail querylog"))
o:value("cutruntimelog", translate("Auto tail runtime log"))
o:value("autohost", translate("Auto update ipv6 hosts and restart adh"))
o:value("autogfw", translate("Auto update gfwlist and restart adh"))
o.widget = "checkbox"
o.default = nil
o.optional = true

o = s:option(TextValue, "downloadlinks", translate("Download links for update"))
o.optional = false
o.rows = 4
o.wrap = "soft"
o.cfgvalue = function(self, section)
	if fs.access("/usr/share/AdGuardHome/links.txt") then
		return fs.readfile("/usr/share/AdGuardHome/links.txt")
	end
	return ""
end
o.write = function(self, section, value)
	if value then
		fs.writefile("/usr/share/AdGuardHome/links.txt", value:gsub("\r\n", "\n"))
	end
end

fs.writefile("/var/run/lucilogpos", "0")

function m.on_commit(map)
	if fs.access("/var/run/AdGserverdis") then
		io.popen("/etc/init.d/AdGuardHome reload &")
		return
	end

	local ucitracktest = uci:get("AdGuardHome", "AdGuardHome", "ucitracktest")
	if ucitracktest == "1" then
		return
	elseif ucitracktest == "0" then
		io.popen("/etc/init.d/AdGuardHome reload &")
	else
		if fs.access("/var/run/AdGlucitest") then
			uci:set("AdGuardHome", "AdGuardHome", "ucitracktest", "0")
			io.popen("/etc/init.d/AdGuardHome reload &")
		else
			fs.writefile("/var/run/AdGlucitest", "")
			if ucitracktest == "2" then
				uci:set("AdGuardHome", "AdGuardHome", "ucitracktest", "1")
			else
				uci:set("AdGuardHome", "AdGuardHome", "ucitracktest", "2")
			end
		end
		uci:save("AdGuardHome")
	end
end

return m
