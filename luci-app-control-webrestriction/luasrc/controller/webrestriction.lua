module("luci.controller.webrestriction", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/webrestriction") then return end

    entry({"admin", "control"}, firstchild(), "Control", 44).dependent = false
    entry({"admin", "control", "webrestriction"}, cbi("webrestriction"), _("访问限制"), 11).dependent = true
 end

