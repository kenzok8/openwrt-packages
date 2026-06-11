module("luci.controller.AdGuardHome", package.seeall)

local fs = require "nixio.fs"
local http = require "luci.http"
local uci = require "luci.model.uci".cursor()

local function service_running()
	local binpath = uci:get("AdGuardHome", "AdGuardHome", "binpath") or "/usr/bin/AdGuardHome"

	if not fs.access(binpath) then
		return false
	end

	return luci.sys.call("/etc/init.d/AdGuardHome status >/dev/null 2>&1") == 0
end

function index()
	-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需重复注册
	if not nixio.fs.access("/usr/share/luci/menu.d/luci-app-adguardhome.json") then
		local page = entry({"admin", "services", "AdGuardHome"},
			alias("admin", "services", "AdGuardHome", "overview"),
			_("AdGuard Home"), 10)
		page.dependent = true
		page.acl_depends = { "luci-app-adguardhome" }

		entry({"admin", "services", "AdGuardHome", "overview"},
			cbi("AdGuardHome/overview"), _("概览"), 1).leaf = true
		entry({"admin", "services", "AdGuardHome", "base"},
			cbi("AdGuardHome/base"), _("基础设置"), 2).leaf = true
		entry({"admin", "services", "AdGuardHome", "tools"},
			cbi("AdGuardHome/tools"), _("运维"), 3).leaf = true
		entry({"admin", "services", "AdGuardHome", "log"},
			form("AdGuardHome/log"), _("日志"), 4).leaf = true
		entry({"admin", "services", "AdGuardHome", "manual"},
			cbi("AdGuardHome/manual"), _("手动配置"), 5).leaf = true
	end

	-- API 路由在新旧版本均需注册
	entry({"admin", "services", "AdGuardHome", "status"},
		call("act_status"), nil).leaf = true
	entry({"admin", "services", "AdGuardHome", "toggle"},
		call("toggle_service"), nil).leaf = true
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
	result.running = service_running()

	local redir = fs.readfile("/var/run/AdGredir")
	result.redirect = (redir == "1")

	http.prepare_content("application/json")
	http.write_json(result)
end

function toggle_service()
	local enabled = http.formvalue("enabled") == "1" and "1" or "0"
	local old_enabled = uci:get("AdGuardHome", "AdGuardHome", "enabled") == "1" and "1" or "0"
	local result = {
		enabled = (enabled == "1")
	}

	-- Preflight: when enabling, make sure the binary is actually present.
	-- Without this, init.d reload silently fails and the UI only sees an
	-- opaque "Operation failed" toast (issue #254).
	if enabled == "1" then
		local binpath = uci:get("AdGuardHome", "AdGuardHome", "binpath") or "/usr/bin/AdGuardHome"
		if not fs.access(binpath) then
			result.success = false
			result.enabled = (old_enabled == "1")
			result.running = false
			result.message = "找不到 AdGuardHome 二进制文件（" .. binpath ..
				"），请先在「运维」页面下载。"
			http.prepare_content("application/json")
			http.write_json(result)
			return
		end
	end

	uci:set("AdGuardHome", "AdGuardHome", "enabled", enabled)
	uci:commit("AdGuardHome")

	local rc
	if enabled == "1" then
		-- Detach the reload from the CGI request so the HTTP call returns
		-- immediately while the daemon comes up. Fully redirecting fds + `&`
		-- is enough — avoid start-stop-daemon, whose busybox applet is not
		-- enabled on some images (e.g. immortalwrt 25.10), where it would
		-- exit 127 and make the toggle wrongly report a start failure (#254).
		rc = luci.sys.call("/etc/init.d/AdGuardHome reload >/dev/null 2>&1 &")
	else
		rc = luci.sys.call("/etc/init.d/AdGuardHome stop >/dev/null 2>&1")
	end

	if enabled == "1" then
		result.running = false
	else
		result.running = service_running()
		for _ = 1, 2 do
			if not result.running then
				break
			end
			luci.sys.call("sleep 1")
			result.running = service_running()
		end
	end

	result.pending = (enabled == "1" and not result.running)
	result.success = (rc == 0) and (enabled == "1" or not result.running)

	if not result.success then
		uci:set("AdGuardHome", "AdGuardHome", "enabled", old_enabled)
		uci:commit("AdGuardHome")
		result.enabled = (old_enabled == "1")
		result.message = enabled == "1" and "AdGuardHome start failed" or "AdGuardHome stop failed"
	end

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
