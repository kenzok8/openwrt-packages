module("luci.controller.AdGuardHome", package.seeall)

local fs = require "nixio.fs"
local http = require "luci.http"
local uci = require "luci.model.uci".cursor()

function index()
	-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需重复注册
	if not nixio.fs.access("/usr/share/luci/menu.d/luci-app-adguardhome.json") then
		local page = entry({"admin", "services", "AdGuardHome"},
			alias("admin", "services", "AdGuardHome", "base"),
			_("AdGuard Home"), 10)
		page.dependent = true
		page.acl_depends = { "luci-app-adguardhome" }

		entry({"admin", "services", "AdGuardHome", "base"},
			cbi("AdGuardHome/base"), _("Base Setting"), 1).leaf = true
		entry({"admin", "services", "AdGuardHome", "log"},
			form("AdGuardHome/log"), _("Log"), 2).leaf = true
		entry({"admin", "services", "AdGuardHome", "manual"},
			cbi("AdGuardHome/manual"), _("Manual Config"), 3).leaf = true
	end

	-- API 路由在新旧版本均需注册
	entry({"admin", "services", "AdGuardHome", "status"},
		call("act_status"), nil).leaf = true
	entry({"admin", "services", "AdGuardHome", "check"},
		call("check_update"), nil)
	entry({"admin", "services", "AdGuardHome", "doupdate"},
		call("do_update"), nil)
	entry({"admin", "services", "AdGuardHome", "getlog"},
		call("get_log"), nil)
	entry({"admin", "services", "AdGuardHome", "dodellog"},
		call("do_dellog"), nil)
	entry({"admin", "services", "AdGuardHome", "reloadconfig"},
		call("reload_config"), nil)
	entry({"admin", "services", "AdGuardHome", "gettemplateconfig"},
		call("get_template_config"), nil)
end

local function gen_template_config()
	local dns_servers = ""
	local resolv_auto = "/tmp/resolv.conf.d/resolv.conf.auto"
	if fs.access(resolv_auto) then
		for line in io.lines(resolv_auto) do
			local ns = line:match("^[^#]*nameserver%s+([^%s]+)")
			if ns then
				dns_servers = dns_servers .. "  - " .. ns .. "\n"
			end
		end
	end

	local tmpl = "/usr/share/AdGuardHome/AdGuardHome_template.yaml"
	local f = io.open(tmpl, "r")
	if not f then return "" end

	local lines = {}
	for line in f:lines() do
		if line == "#bootstrap_dns" then
			table.insert(lines, dns_servers)
		elseif line == "#upstream_dns" then
			table.insert(lines, dns_servers)
		else
			table.insert(lines, line)
		end
	end
	f:close()
	return table.concat(lines, "\n")
end

function get_template_config()
	http.prepare_content("text/plain; charset=utf-8")
	http.write(gen_template_config())
end

function reload_config()
	fs.remove("/tmp/AdGuardHometmpconfig.yaml")
	http.prepare_content("application/json")
	http.write('{}')
end

function act_status()
	local result = {}
	local binpath = uci:get("AdGuardHome", "AdGuardHome", "binpath") or "/usr/bin/AdGuardHome"

	if fs.access(binpath) then
		-- Security fix: binpath 来自 UCI 用户数据，用单引号包裹防止命令注入
		local safe_bin = binpath:gsub("'", "'\\''")
		result.running = (luci.sys.call("pgrep -f '" .. safe_bin .. "' >/dev/null 2>&1") == 0)
	else
		result.running = false
	end

	local redir = fs.readfile("/var/run/AdGredir")
	result.redirect = (redir == "1")

	http.prepare_content("application/json")
	http.write_json(result)
end

function do_update()
	fs.writefile("/var/run/lucilogpos", "0")
	http.prepare_content("application/json")
	http.write('{}')

	local arg = ""
	if luci.http.formvalue("force") == "1" then
		arg = "force"
	end

	local script = "/usr/share/AdGuardHome/update_core.sh"
	if fs.access("/var/run/update_core") then
		if arg == "force" then
			-- Security fix: script 路径是固定常量，arg 只能是 "force" 或 ""，无注入风险
			luci.sys.exec("pkill -f '" .. script .. "' 2>/dev/null; " .. script .. " " .. arg .. " >/tmp/AdGuardHome_update.log 2>&1 &")
		end
	else
		luci.sys.exec(script .. " " .. arg .. " >/tmp/AdGuardHome_update.log 2>&1 &")
	end
end

function get_log()
	local logfile = uci:get("AdGuardHome", "AdGuardHome", "logfile")

	if not logfile or logfile == "" then
		http.write("no log available\n")
		return
	end

	if logfile == "syslog" then
		if not fs.access("/var/run/AdGuardHomesyslog") then
			luci.sys.exec("(/usr/share/AdGuardHome/getsyslog.sh &); sleep 1;")
		end
		logfile = "/tmp/AdGuardHometmp.log"
		fs.writefile("/var/run/AdGuardHomesyslog", "1")
	elseif not fs.access(logfile) then
		http.write("")
		return
	end

	http.prepare_content("text/plain; charset=utf-8")

	local fdp = 0
	if fs.access("/var/run/lucilogreload") then
		fdp = 0
		fs.remove("/var/run/lucilogreload")
	else
		local pos = fs.readfile("/var/run/lucilogpos")
		fdp = tonumber(pos) or 0
	end

	local f = io.open(logfile, "r")
	if not f then
		http.write("")
		return
	end

	f:seek("set", fdp)
	local content = f:read(2048000) or ""
	fdp = f:seek()
	f:close()

	fs.writefile("/var/run/lucilogpos", tostring(fdp))
	http.write(content)
end

function do_dellog()
	local logfile = uci:get("AdGuardHome", "AdGuardHome", "logfile")
	if logfile and logfile ~= "" and logfile ~= "syslog" then
		fs.writefile(logfile, "")
	end
	http.prepare_content("application/json")
	http.write('{}')
end

function check_update()
	http.prepare_content("text/plain; charset=utf-8")

	local pos = fs.readfile("/var/run/lucilogpos")
	local fdp = tonumber(pos) or 0

	local f = io.open("/tmp/AdGuardHome_update.log", "r")
	if not f then
		http.write("")
		return
	end

	f:seek("set", fdp)
	local content = f:read(2048000) or ""
	fdp = f:seek()
	f:close()

	fs.writefile("/var/run/lucilogpos", tostring(fdp))

	if fs.access("/var/run/update_core") then
		http.write(content)
	else
		http.write(content .. "\0")
	end
end
