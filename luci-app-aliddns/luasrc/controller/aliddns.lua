module("luci.controller.aliddns", package.seeall)

local fs = require "nixio.fs"

function index()
	if not fs.access("/etc/config/aliddns") then
		return
	end

	entry({"admin", "services", "aliddns"}, cbi("aliddns"), _("AliDDNS"), 58)
end
