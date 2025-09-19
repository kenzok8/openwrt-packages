module("luci.controller.api", package.seeall)

http = require "luci.http"
fs = require "nixio.fs"
uci = require "luci.model.uci".cursor()
json = require "luci.jsonc"
     
function index()
    entry({"api", "get"}, call("get_theme"), nil, 10)
    entry({"api", "set"}, call("set_theme"), nil, 20)
end

function get_theme()
    local kucat = nil
    local config_exists = false
    local bgqs = "1"
    local primaryrgbm = "45,102,147"
    local primaryrgbmts = "0"
    local mode = "auto"

    if fs.access("/etc/config/advancedplus") then
        kucat = "advancedplus"
        config_exists = true
    elseif fs.access("/etc/config/kucat") then
        kucat = "kucat"
        config_exists = true
    end

    if config_exists then
        local ku = uci:get_all(kucat, "@basic[0]") or {}
        bgqs = ku.bgqs or bgqs
        primaryrgbm = ku.primary_rgbm or primaryrgbm
        primaryrgbmts = ku.primary_rgbm_ts or primaryrgbmts
        mode = ku.mode or mode
    end

    http.prepare_content("application/json")
    http.write_json({
        success = config_exists,
        bgqs = bgqs,
        primaryrgbm = primaryrgbm,
        primaryrgbmts = primaryrgbmts,
	mode = mode
    })
end

function set_theme()
    local kucat = nil
    local config_exists = false
    local theme = http.formvalue("theme")
    if fs.access("/etc/config/advancedplus") then
       kucat = 'advancedplus'
       config_exists = true
    elseif fs.access("/etc/config/kucat") then
       kucat = 'kucat'
       config_exists = true
    end
    if (config_exists) then
           local esc_kucat = "'" .. kucat:gsub("'", "'\\''") .. "'"
    local esc_theme = "'" .. theme:gsub("'", "'\\''") .. "'"
    
    os.execute(string.format(
        "uci set %s.@basic[0].mode=%s && uci commit %s",
        kucat, esc_theme, kucat
    ))
       uci:set(kucat, "@basic[0]", "mode", theme)
       uci:commit(kucat)
       http.prepare_content("application/json")
       http.write_json({ success = true })
    else
       http.prepare_content("application/json")
       http.write_json({ success = false })
    end
end
