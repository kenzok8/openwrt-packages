module("luci.controller.argone-config", package.seeall)

function index()
	if not nixio.fs.access('/www/luci-static/argon/css/cascade.css') then
		return
	end

	local page = entry({"admin", "system", "argone-config"}, form("argone-config"), _("Argon Config"), 90)
	page.acl_depends = { "luci-app-argone-config" }
end
