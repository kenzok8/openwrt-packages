module("luci.controller.design-config", package.seeall)

local fs = require "nixio.fs"

function index()
	if not fs.access('/www/luci-static/design/css/style.css') then
		return
	end

	local page = entry({"admin", "system", "design-config"}, form("design-config"), _("Design Config"), 90)
	page.acl_depends = { "luci-app-design-config" }
end
