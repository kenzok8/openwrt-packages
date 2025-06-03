local http = require "luci.http"

module("luci.controller.quickstart", package.seeall)

function index()
    if luci.sys.call("pgrep quickstart >/dev/null") == 0 then
        local uci = require "luci.model.uci".cursor()
        entry({"admin", "quickstart"}, template("quickstart/home"), _("QuickStart"), 1).leaf = true
        entry({"admin", "network_guide"}, call("networkguide_index"), _("NetworkGuide"), 2)
        entry({"admin", "network_guide", "pages"}, call("quickstart_index", {index={"admin", "network_guide", "pages"}})).leaf = true
        if uci:get("quickstart", "main", "wifi_menu") == "1" then
            entry({"admin", "quickwifi"}, call("quickwifi_index"), _("Wireless"), 3)
            entry({"admin", "quickwifi", "pages"}, call("quickstart_index", {index={"admin", "quickwifi", "pages"}})).leaf = true
        end
        if nixio.fs.access("/usr/lib/lua/luci/view/quickstart/main_dev.htm") then
            entry({"admin", "quickstart_dev"}, call("quickstart_dev", {index={"admin", "quickstart_dev"}})).leaf = true
        end
        entry({"admin", "nas", "raid"}, call("quickstart_index", {index={"admin", "nas"}}), _("RAID"), 10).leaf = true
        entry({"admin", "nas", "smart"}, call("quickstart_index", {index={"admin", "nas"}}), _("S.M.A.R.T."), 11).leaf = true
        entry({"admin", "network", "interfaceconfig"}, call("quickstart_index", {index={"admin", "network"}}), _("NetworkPort"), 11).leaf = true

        entry({"admin", "nas", "quickstart"}).dependent = false
        entry({"admin", "nas", "quickstart", "auto_setup"}, post("auto_setup"))
        entry({"admin", "nas", "quickstart", "setup_result"}, call("setup_result"))
    else
        entry({"admin", "quickstart"}, call("redirect_fallback")).leaf = true
    end
end

function networkguide_index()
    luci.http.redirect(luci.dispatcher.build_url("admin", "network_guide", "pages", "network"))
end

function quickwifi_index()
    luci.http.redirect(luci.dispatcher.build_url("admin", "quickwifi", "pages", "quickwifi"))
end

function redirect_fallback()
    luci.http.redirect(luci.dispatcher.build_url("admin", "status"))
end

local function vue_lang()
    local i18n = require("luci.i18n")
    local lang = i18n.translate("quickstart_vue_lang")
    if lang == "quickstart_vue_lang" or lang == "" then
        lang = "en"
    end
    return lang
end

function quickstart_index(param)
    luci.template.render("quickstart/main", {prefix=luci.dispatcher.build_url(unpack(param.index)),lang=vue_lang()})
end

function quickstart_dev(param)
    luci.template.render("quickstart/main_dev", {prefix=luci.dispatcher.build_url(unpack(param.index)),lang=vue_lang()})
end

function auto_setup()
    local os   = require "os"
    local fs   = require "nixio.fs"
    local rshift  = nixio.bit.rshift

    -- json style
    -- local jsonc = require "luci.jsonc"
    -- local json_parse = jsonc.parse
    -- local req = json_parse(luci.http.content())
    -- local pkgs = ""
    -- for k, v in pairs(req.packages) do
    --     pkgs = pkgs .. " " .. luci.util.shellquote(v)
    -- end
    
    -- form style
    local packages = luci.http.formvalue("packages")
    local pkgs = ""
    if type(packages) == "table" then
        if #packages > 0 then
            for k, v in pairs(packages) do
                pkgs = pkgs .. " " .. luci.util.shellquote(v)
            end
        end
    else
        if packages ~= nil and packages ~= "" then
            pkgs = luci.util.shellquote(packages)
        end
    end


    local ret
    if pkgs == "" then
        ret = {
            success = 1,
            scope = "params",
            error = "Parameter 'packages' undefined!",
        }
    else
        local cmd = "/usr/libexec/quickstart/auto_setup.sh " .. pkgs
        cmd = "/etc/init.d/tasks task_add auto_setup " .. luci.util.shellquote(cmd)
        local r = os.execute(cmd .. " >/var/log/auto_setup.stdout 2>/var/log/auto_setup.stderr")
        local e = fs.readfile("/var/log/auto_setup.stderr")
        local o = fs.readfile("/var/log/auto_setup.stdout")

        fs.unlink("/var/log/auto_setup.stderr")
        fs.unlink("/var/log/auto_setup.stdout")
        e = e or ""
        if r == 256 and e == "" then
            e = "os.execute exit code 1"
        end
        r = rshift(r,8)
        ret = {
            success = r,
            scope = "taskd",
            error = e,
            detail = o,
        }
    end
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end

function setup_result()
    local fs   = require "nixio.fs"
    local taskd = require "luci.model.tasks"
    local packages = nil
    local success = nil
    local failed = nil
    local status = taskd.status("auto_setup")
    local ret = {
    }
    if status.running or status.exit_code ~= 404 then
        local item
        local po = fs.readfile("/var/log/auto_setup.input") or ""
        for item in po:gmatch("[^\n]+") do
            if packages then
                packages[#packages+1] = item
            else
                packages = {item}
            end
        end
        local so = fs.readfile("/var/log/auto_setup.success") or ""
        for item in so:gmatch("[^\n]+") do
            if success then
                success[#success+1] = item
            else
                success = {item}
            end
        end
        local fo = fs.readfile("/var/log/auto_setup.failed") or ""
        for item in fo:gmatch("[^\n]+") do
            if failed then
                failed[#failed+1] = item
            else
                failed = {item}
            end
        end
        ret.success = 0
        ret.result = {
            ongoing = status.running,
            packages = packages,
            success = success,
            failed = failed,
        }
    else
        ret.success = 404
        ret.scope = "taskd"
        ret.error = "task not found"
    end
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end
