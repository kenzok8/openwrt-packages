local http = require "luci.http"

module("luci.controller.quickstart", package.seeall)

local page_index = {"admin", "quickstart", "pages"}

function index()
    if luci.sys.call("pgrep quickstart >/dev/null") == 0 then
        entry({"admin", "quickstart"}, call("redirect_index"), _("QuickStart"), 1)
        entry({"admin", "network_guide"}, call("networkguide_index"), _("NetworkGuide"), 2)
        entry({"admin", "quickstart", "pages"}, call("quickstart_index")).leaf = true
        if nixio.fs.access("/usr/lib/lua/luci/view/quickstart/main_dev.htm") then
            entry({"admin", "quickstart", "dev"}, call("quickstart_dev")).leaf = true
        end
    else
        entry({"admin", "quickstart"})
        entry({"admin", "quickstart", "pages"}, call("redirect_fallback")).leaf = true
    end
end

function networkguide_index()
    luci.http.redirect(luci.dispatcher.build_url("admin","quickstart","pages","network"))
end

function redirect_index()
    luci.http.redirect(luci.dispatcher.build_url(unpack(page_index)))
end

function redirect_fallback()
    luci.http.redirect(luci.dispatcher.build_url("admin","status"))
end

function quickstart_index()
    luci.template.render("quickstart/main", {prefix=luci.dispatcher.build_url(unpack(page_index))})
end

function quickstart_dev()
    luci.template.render("quickstart/main_dev", {prefix=luci.dispatcher.build_url(unpack({"admin", "quickstart", "dev"}))})
end
