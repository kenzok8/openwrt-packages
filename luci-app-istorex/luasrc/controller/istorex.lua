
module("luci.controller.istorex", package.seeall)

function index()
    if luci.sys.call("pgrep quickstart >/dev/null") == 0 then
        entry({"admin", "istorex"}, call("istorex_template")).leaf = true
        if nixio.fs.access("/usr/lib/lua/luci/view/istorex/main_dev.htm") then
            entry({"admin", "istorex_dev"}, call("istorex_template_dev")).leaf = true
        end
    else
        entry({"admin", "istorex"}, call("redirect_fallback")).leaf = true
    end
    entry({"admin", "istorex_api","status"}, call("istorex_api_status")).dependent = false
    entry({"admin", "istorex_api","update"}, call("istorex_api_update")).dependent = false
    entry({"admin", "istorex_api","upload-bg"}, call("istorex_api_uploadbg")).dependent = false
end

local function user_id()
    local jsonc = require "luci.jsonc"
    local json_parse = jsonc.parse
    local fs   = require "nixio.fs"
	local data = fs.readfile("/etc/.app_store.id")

    local id
    if data ~= nil then
        id = json_parse(data)
    end
    if id == nil then
        fs.unlink("/etc/.app_store.id")
        id = {arch="",uid=""}
    end

    id.version = (fs.readfile("/etc/.app_store.version") or "?"):gsub("[\r\n]", "")

    return id
end

function get_config_data()
    local uci  = require "luci.model.uci".cursor()
    local model   = uci:get_first("istorex", "istorex", "model")
    local enabled = uci:get_first("istorex", "istorex", "enabled")
    local data = {
        model   = model,
        enabled = enabled,
    }
    return data
end

function get_params()
    local config = get_config_data()
    local data = {
        prefix=luci.dispatcher.build_url(unpack({"admin", "istorex"})),
        id=user_id(),
        model = config.model,
    }
    return data
end

function get_dev_params()
    local config = get_config_data()
    local data = {
        prefix=luci.dispatcher.build_url(unpack({"admin", "istorex_dev"})),
        id=user_id(),
        model = config.model,
    }
    return data
end

function redirect_fallback()
    luci.http.redirect(luci.dispatcher.build_url("admin","status"))
end

function istorex_template()
    luci.template.render("istorex/main", get_params())
end

function istorex_template_dev()
    luci.template.render("istorex/main_dev", get_dev_params())
end

function istorex_api_status()
    local result = get_config_data()
    luci.http.prepare_content("application/json")
    luci.http.write_json({
         success = 0,
         result  = result,
    })
end

function istorex_api_update()
    local http = require "luci.http"
    local jsonc = require "luci.jsonc"
    local uci  = require "luci.model.uci".cursor()
    local content = http.content()
    local json_parse = jsonc.parse
    local req = json_parse(content)
    local data = {
    }
    if req == nil or next(req) == nil then
        data.error = "invalid request"
    else
        uci:set("istorex","@istorex[0]","model", req.model)
        uci:commit("istorex")
        data.success = 0
    end
    http.prepare_content("application/json")
    http.write_json(data)
end

function istorex_api_uploadbg()
    local uci = require "uci"
    local x = uci.cursor()
    local fd
    local path
    local finished = false
    local tmpdir = "/www/luci-static/istorex/image"
    local filename = ""
    luci.http.setfilehandler(
        function(meta, chunk, eof)
            if not fd then
                filename = meta.file
                path = tmpdir .. "/bg.gif" 
                fd = io.open(path, "w")
            end
            if chunk then
                fd:write(chunk)
            end
            if eof then
                fd:close()
                finished = true
            end
        end
    )
    luci.http.formvalue("file")
    local result = {
        filename = filename
    }
    local data = {
        success = finished,
        result  = result
    }
    luci.http.prepare_content("application/json")
    luci.http.write_json(data)
end
