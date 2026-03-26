module("luci.controller.eqos", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/eqos") then
        return
    end

    local page = entry({"admin", "network", "eqos"}, cbi("eqos"), _("EQOS"), 121)
    page.dependent = true
    page.acl_depends = { "luci-app-eqos" }
end
