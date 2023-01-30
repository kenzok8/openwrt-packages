module("luci.controller.alist", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/alist") then
		return
	end

	local page = entry({"admin", "nas", "alist"}, alias("admin", "nas", "alist", "basic"), _("Alist"), 20)
	page.dependent = true
	page.acl_depends = { "luci-app-alist" }

	entry({"admin", "nas"}, firstchild(), "NAS", 44).dependent = false
	entry({"admin", "nas", "alist", "basic"}, cbi("alist/basic"), _("Basic Setting"), 1).leaf = true
	entry({"admin", "nas", "alist", "log"}, cbi("alist/log"), _("Logs"), 2).leaf = true
	entry({"admin", "nas", "alist", "alist_status"}, call("alist_status")).leaf = true
	entry({"admin", "nas", "alist", "get_log"}, call("get_log")).leaf = true
	entry({"admin", "nas", "alist", "clear_log"}, call("clear_log")).leaf = true
	entry({"admin", "nas", "alist", "admin_info"}, call("admin_info")).leaf = true
end

function alist_status()
	local sys  = require "luci.sys"
	local uci  = require "luci.model.uci".cursor()
	local port = tonumber(uci:get_first("alist", "alist", "port"))

	local status = {
		running = (sys.call("pidof alist >/dev/null") == 0),
		port = (port or 5244)
	}

	luci.http.prepare_content("application/json")
	luci.http.write_json(status)
end

function get_log()
	luci.http.write(luci.sys.exec("cat $(uci -q get alist.@alist[0].temp_dir)/alist.log"))
end

function clear_log()
	luci.sys.call("cat /dev/null > $(uci -q get alist.@alist[0].temp_dir)/alist.log")
end

function admin_info()
	local username = luci.sys.exec("/usr/bin/alist --data /etc/alist password 2>&1 | tail -2 | awk 'NR==1 {print $2}'")
	local password = luci.sys.exec("/usr/bin/alist --data /etc/alist password 2>&1 | tail -2 | awk 'NR==2 {print $2}'")

	luci.http.prepare_content("application/json")
	luci.http.write_json({username = username, password = password})
end
