module("luci.controller.eqos", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/eqos") then
		return
	end
	
	local page
        entry({"admin", "nas"}, firstchild(), "NAS", 45).dependent = false
	entry({"admin", "network", "eqos"}, cbi("eqos"), _("EQoS"))
end
