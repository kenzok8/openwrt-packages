module("luci.controller.aliddns", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/aliddns") then
		return
	end

	local page = entry({"admin", "services", "aliddns"}, cbi("aliddns"), _("AliDDNS"), 58)
	page.dependent = true
	page.acl_depends = { "luci-app-aliddns" }
end
