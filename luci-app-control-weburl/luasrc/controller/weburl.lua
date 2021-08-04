module("luci.controller.weburl", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/weburl") then return end

    entry({"admin", "control"}, firstchild(), "Control", 44).dependent = false
    entry({"admin", "control", "weburl"}, cbi("weburl"), _("管控过滤"), 1).dependent =
        true
end

