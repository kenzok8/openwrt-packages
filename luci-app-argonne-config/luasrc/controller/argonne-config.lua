module("luci.controller.argonne-config", package.seeall)

function index()
	if not nixio.fs.access('/www/luci-static/argonne/css/cascade.css') then
		return
	end

	local page = entry({"admin", "system", "argonne-config"}, form("argonne-config"), _("Argonne Config"), 90)
	page.acl_depends = { "luci-app-argonne-config" }
end
