module("luci.controller.argon-config", package.seeall)

function index()
	if not nixio.fs.access('/www/luci-static/argon/css/cascade.css') then
		return
	end

	local page = entry({"admin", "system", "argon-config"}, form("argon-config"), _("Argon Config"), 90)
	page.acl_depends = { "luci-app-argon-config" }
end
