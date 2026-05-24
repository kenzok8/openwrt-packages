require("luci.sys")
require("luci.util")
require("io")

local m, s, o, o1
local fs = require "nixio.fs"
local uci = require "luci.model.uci".cursor()

local configpath = uci:get("AdGuardHome", "AdGuardHome", "configpath") or "/etc/AdGuardHome.yaml"
local binpath = uci:get("AdGuardHome", "AdGuardHome", "binpath") or "/usr/bin/AdGuardHome"
local httpport = uci:get("AdGuardHome", "AdGuardHome", "httpport") or "3000"

local function service_running()
	if not fs.access(binpath) then
		return false
	end
	return luci.sys.call("/etc/init.d/AdGuardHome status >/dev/null 2>&1") == 0
end

m = Map("AdGuardHome", "AdGuard Home")
m.description = translate("Free and open source, powerful network-wide ads & trackers blocking DNS server.")

-- Inject card-style CSS for AGH pages


-- ============================================================
-- Section 1: Basic Settings
-- ============================================================
s = m:section(NamedSection, "AdGuardHome", "AdGuardHome", "基本设置")

o = s:option(Flag, "enabled", translate("Enable"))
o.default = "0"
o.optional = false
o.template = "AdGuardHome/enable_switch"
o.cfgvalue = function()
	return service_running() and "1" or "0"
end

o = s:option(Value, "httpport", translate("Browser management port"))
o.placeholder = "3000"
o.default = "3000"
o.datatype = "port"
o.optional = false

o = s:option(Button, "restart", translate("Update"))
o.inputtitle = translate("Update core version")
o.template = "AdGuardHome/AdGuardHome_check"
o.showfastconfig = not fs.access(configpath)

o = s:option(ListValue, "release_channel", translate("更新通道"),
	translate("正式版稳定；预发布版抢先体验 AdGuard 团队 beta 构建。"))
o:value("stable", translate("正式版 (stable)"))
o:value("beta", translate("预发布版 (beta)"))
o.default = "stable"
o.rmempty = false

local port = luci.sys.exec("awk '/^  port:/{print $2;exit}' " .. configpath .. " 2>/dev/null")
if not port or port == "" then
	port = "?"
end

o = s:option(ListValue, "redirect", port .. translate("Redirect"), translate("AdGuardHome redirect mode"))
o:value("none", translate("不启用"))
o:value("dnsmasq-upstream", translate("作为 dnsmasq 上游服务器"))
o:value("redirect", translate("将 53 端口劫持到 AdGuardHome"))
o:value("exchange", translate("使用 53 端口替代 dnsmasq"))
o.default = "none"
o.optional = true

-- ============================================================
-- Section 2: Paths & Logs
-- ============================================================
s = m:section(NamedSection, "AdGuardHome", "AdGuardHome", "路径与日志")

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
		m.message = (m.message or "") .. "\n" .. translate("Error: bin path is a directory")
		return nil
	end
	return value
end

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
		m.message = (m.message or "") .. "\n" .. translate("Error: config path is a directory")
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
		m.message = (m.message or "") .. "\n" .. translate("Error: work dir is a file")
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
		m.message = (m.message or "") .. "\n" .. translate("Error: log file is a directory")
		return nil
	end
	return value
end

o = s:option(Flag, "verbose", translate("Verbose log"))
o.default = "0"
o.optional = true

-- ============================================================
-- Section 3: Advanced Settings
-- ============================================================
s = m:section(NamedSection, "AdGuardHome", "AdGuardHome", "高级设置")

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

o = s:option(Value, "user", translate("Service user"), translate("User the service runs under. If empty, defaults to 'adguardhome'."))
o.placeholder = "adguardhome"
o.datatype = "string"
o.rmempty = true

o = s:option(Value, "group", translate("Service group"), translate("Group the service runs under. If empty, defaults to 'adguardhome'."))
o.placeholder = "adguardhome"
o.datatype = "string"
o.rmempty = true

-- Helper：兼容把旧的 newline-separated 字符串读成 table（仅一次性迁移期需要）
local function split_legacy_list(value)
	if type(value) ~= "string" or value == "" then return value end
	if not value:find("[\r\n]") then return value end
	local t = {}
	for line in value:gmatch("[^\r\n]+") do
		line = line:match("^%s*(.-)%s*$")
		if line ~= "" then t[#t+1] = line end
	end
	return t
end

o = s:option(DynamicList, "jail_mount", translate("只读文件访问"),
	translate("AdGuardHome 可以读取的目录或文件路径，每行一项。"))
o.placeholder = "/etc/hosts"
o.rmempty = true
o.cfgvalue = function(self, section)
	return split_legacy_list(uci:get("AdGuardHome", section, "jail_mount"))
end

o = s:option(DynamicList, "jail_mount_rw", translate("读写文件访问"),
	translate("AdGuardHome 可以读写的目录或文件路径，每行一项。"))
o.placeholder = "/var/log/AdGuardHome"
o.rmempty = true
o.cfgvalue = function(self, section)
	return split_legacy_list(uci:get("AdGuardHome", section, "jail_mount_rw"))
end

-- Probe system memory to suggest a sane MiB cap (≈50% of total RAM)
local total_mem_kb = tonumber(luci.sys.exec("awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null")) or 0
local mem_suggest_mib = (total_mem_kb > 0) and math.floor(total_mem_kb / 1024 / 2) or 128

o = s:option(Value, "memlimit", translate("内存上限 (MiB)"),
	translate("达到阈值时主动触发 GC，避免被系统 OOM 杀进程。留空 = 不限制。建议设为系统内存的 50%。"))
o.datatype = "uinteger"
o.placeholder = translate("推荐 ") .. tostring(mem_suggest_mib)
o.rmempty = true

o = s:option(Flag, "waitonboot", translate("On boot when network ok restart"))
o.default = "1"
o.rmempty = true

-- ============================================================
-- Commit handler
-- ============================================================
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
