require("luci.sys")
require("luci.util")

local m, s, o, o1
local fs = require "nixio.fs"
local uci = require "luci.model.uci".cursor()

local workdir = uci:get("AdGuardHome", "AdGuardHome", "workdir") or "/etc/AdGuardHome"

m = Map("AdGuardHome", translate("运维"))
m.description = translate("改密、备份、计划任务、下载源")



s = m:section(NamedSection, "AdGuardHome", "AdGuardHome", "")
s.anonymous = true
s.addremove = false

-- Change password ------------------------------------------------
o = s:option(Value, "hashpass", translate("Change browser management password"),
	translate("Press load culculate model and culculate finally save/apply"))
o.default = ""
o.datatype = "string"
o.template = "AdGuardHome/AdGuardHome_chpass"
o.rmempty = true

-- Upgrade keep files ---------------------------------------------
o = s:option(MultiValue, "upprotect", translate("Keep files when system upgrade"),
	translate("刷固件 (sysupgrade) 时保留这些文件。普通用户按推荐勾选即可：核心 + 配置 + filters + sessions.db + stats.db。日志和 querylog 通常不需要保留（querylog 可能占数十 MB）。"))
o:value("$binpath",                       translate("核心执行文件 (推荐)"))
o:value("$configpath",                    translate("配置文件 (必选)"))
o:value("$logfile",                       translate("日志文件"))
o:value("$workdir/data/sessions.db",      translate("登录会话 sessions.db (推荐)"))
o:value("$workdir/data/stats.db",         translate("统计 stats.db (推荐)"))
o:value("$workdir/data/querylog.json",    translate("查询日志 querylog.json (占空间)"))
o:value("$workdir/data/filters",          translate("过滤规则 filters (推荐)"))
o.widget = "checkbox"
o.default = "$binpath $configpath $workdir/data/sessions.db $workdir/data/stats.db $workdir/data/filters"
o.optional = false

-- Backup workdir -------------------------------------------------
o  = s:option(MultiValue, "backupfile",   translate("Backup workdir files when shutdown"),
	translate("关机时把这些文件复制到下方「备份工作目录路径」，下次开机如果 workdir/data 为空会自动恢复。仅当工作目录位于 tmpfs（如 /tmp）时才需要勾选，持久化路径无需备份。"))
o1 = s:option(Value,      "backupwdpath", translate("Backup workdir path"))

o:value("filters",        "filters")
o:value("stats.db",       "stats.db")
o:value("querylog.json",  "querylog.json")
o:value("sessions.db",    "sessions.db")
o1:depends("backupfile", "filters")
o1:depends("backupfile", "stats.db")
o1:depends("backupfile", "querylog.json")
o1:depends("backupfile", "sessions.db")

if fs.access(workdir .. "/data") then
	for name in fs.glob(workdir .. "/data/*") do
		local basename = fs.basename(name)
		if basename ~= "filters" and basename ~= "stats.db"
			and basename ~= "querylog.json" and basename ~= "sessions.db" then
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
		m.message = (m.message or "") .. "\n" .. translate("Error: backup dir is a file")
		return nil
	end
	if value and value:sub(-1) == "/" then
		return value:sub(1, -2)
	end
	return value
end

-- Crontab tasks --------------------------------------------------
o = s:option(MultiValue, "crontab", translate("Crontab task"),
	translate("Please change time and args in crontab"))
o:value("autoupdate",      translate("Auto update core"))
o:value("cutquerylog",     translate("Auto tail querylog"))
o:value("cutruntimelog",   translate("Auto tail runtime log"))
o:value("autohost",        translate("Auto update ipv6 hosts and restart adh"))
o.widget = "checkbox"
o.default = nil
o.optional = false

-- Download links -------------------------------------------------
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

return m
