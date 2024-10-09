-- Copyright (C) 2021-2022  sirpdboy  <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-ddns-go
-- Licensed to the public under the Apache License 2.0.

module("luci.controller.ddns-go", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/ddns-go") then
		return
	end

	local e=entry({"admin",  "services", "ddns-go"}, alias("admin", "services", "ddns-go", "setting"),_("DDNS-GO"), 58)
	e.dependent=false
	e.acl_depends={ "luci-app-ddns-go" }
	entry({"admin", "services", "ddns-go", "setting"}, cbi("ddns-go"), _("Base Setting"), 20).leaf=true
	entry({"admin",  "services", "ddns-go", "ddns-go"}, template("ddns-go/ddns-go"), _("DDNS-GO Control panel"), 30).leaf = true
	entry({"admin", "services", "ddnsgo_status"}, call("act_status"))
	entry({"admin", "services", "ddns-go", "log"}, template("ddns-go/ddns-go_log"), _("Log"), 40).leaf = true
	entry({"admin", "services", "ddns-go", "fetch_log"}, call("fetch_log"), nil).leaf = true
	entry({"admin", "services", "ddns-go", "clear_log"}, call("clear_log")).leaf = true
end

function act_status()
	local sys  = require "luci.sys"
	local e = { }
	e.running = sys.call("pidof ddns-go >/dev/null") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
function fetch_log()
    local fs = require "nixio.fs"
    local log_file = "/var/log/ddns-go.log"
    local log_content = fs.readfile(log_file) or "No Log."
    luci.http.write(log_content)
end
function clear_log()
    local fs = require "nixio.fs"
    local log_file = "/var/log/ddns-go.log"
    local f = io.open(log_file, "w")
    if f then
        f:close()
        luci.http.status(204, "No Content")
    else
        luci.http.status(500, "Internal Server Error")
    end
end
