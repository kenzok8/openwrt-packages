module("luci.controller.mosdns", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/mosdns") then
		return
	end
	
	local page = entry({"admin", "services", "mosdns"}, alias("admin", "services", "mosdns", "basic"), _("MosDNS"), 30)
	page.dependent = true
	page.acl_depends = { "luci-app-mosdns" }
	
	entry({"admin", "services", "mosdns", "basic"}, cbi("mosdns/basic"), _("Basic Setting"), 1).leaf = true
	entry({"admin", "services", "mosdns", "update"}, cbi("mosdns/update"), _("Geodata Update"), 2).leaf = true
	entry({"admin", "services", "mosdns", "status"}, call("act_status")).leaf = true
end

function act_status()
	local e = {}
	e.running = luci.sys.call("pgrep -f mosdns >/dev/null") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
