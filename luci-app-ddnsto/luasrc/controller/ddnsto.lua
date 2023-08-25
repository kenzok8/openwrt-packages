local http = require "luci.http"
module("luci.controller.ddnsto", package.seeall)

function index()
        if not nixio.fs.access("/etc/config/ddnsto") then
                return
        end

        entry({"admin","services", "ddnsto"}, call("redirect_index"), _("DDNSTO 远程控制"), 20).dependent = true
        entry({"admin","services", "ddnsto", "pages"}, call("ddnsto_index")).leaf = true
        if nixio.fs.access("/usr/lib/lua/luci/view/ddnsto/main_dev.htm") then
            entry({"admin","services", "ddnsto", "dev"}, call("ddnsto_dev")).leaf = true
        end

        -- entry({"admin", "services", "ddnsto"}, cbi("ddnsto"), _("DDNS.to"), 20)

        -- entry({"admin", "services", "ddnsto_status"}, call("ddnsto_status"))
		entry({"admin", "services", "ddnsto", "form"}, call("ddnsto_form"))
        entry({"admin", "services", "ddnsto", "submit"}, call("ddnsto_submit"))
        entry({"admin", "services", "ddnsto", "log"}, call("ddnsto_log"))

end


local function isempty(s)
    return s == nil or s == ''
end

local function trim(input)
    return (string.gsub(input, "^%s*(.-)%s*$", "%1"))
end


local function get_data() 
    local uci  = require "luci.model.uci".cursor()

    local data = {
        enabled = uci:get_first("ddnsto", "ddnsto", "enabled") == "1",
        feat_disk_path_selected = uci:get_first("ddnsto", "ddnsto", "feat_disk_path_selected") ,
        feat_enabled = uci:get_first("ddnsto", "ddnsto", "feat_enabled") == "1" ,
        feat_password = uci:get_first("ddnsto", "ddnsto", "feat_password"),
        feat_username = uci:get_first("ddnsto", "ddnsto", "feat_username"),
        feat_port = tonumber(uci:get_first("ddnsto", "ddnsto", "feat_port")),
        index = (tonumber(uci:get_first("ddnsto", "ddnsto", "index")) or 0),
        token = uci:get_first("ddnsto", "ddnsto", "token")
    }
    return data
end

local function get_command(cmd)
    local handle = io.popen(cmd, "r")
    if handle then
        local res = string.gsub(handle:read("*a"), "\n", "")   
        handle:close()
        return res
    end
    return ""
    
end

local function status_container()
    local sys  = require "luci.sys"
    local uci  = require "luci.model.uci".cursor()
 

    local running = "<a style=\"color:red;font-weight:bolder\">未运行</a>"
    local feat_running = "未运行"
    local webdav_running = "未启用"
    local webdav_url = "未启用"
    local wol_running = "未启用"
   
    local cmd = "/usr/sbin/ddnstod -x ".. tostring(get_data().index) .." -w | awk '{print $2}'"
    local device_id = get_command(cmd) 
    local version = get_command("/usr/sbin/ddnstod -v")   

    if sys.call("pidof ddnstod >/dev/null") == 0 then
        running = "<a style=\"color:green;font-weight:bolder\">已启动</a>"
    end

    local feat_port = (tonumber(uci:get_first("ddnsto", "ddnsto", "feat_port")) or 3030)
    local http = require "luci.http" 
    local ip = http.getenv('SERVER_NAME')
    if sys.call("pidof ddwebdav >/dev/null") == 0 then
        feat_running =  "<a style=\"color:green;font-weight:bolder\">已启用</a>"
        webdav_running = "已启用"
        wol_running = "已启用"
        webdav_url = "http://" .. ip ..":".. feat_port .. "/webdav"
    end

	local uci  = require "luci.model.uci".cursor()
	local feat_username = (uci:get_first("ddnsto", "ddnsto", "feat_username") or "")
 
    local c1 = {
        labels = { 
            {
            key = "服务状态",
            value = running
        },
        {
            key = "插件版本",
            value = version
        }, 
        {
            key = "设备ID",
            value = device_id .. "（设备编号: ".. get_data().index .."）"
        }, 
        {
            key = "拓展功能",
            value = feat_running
        }, 
        {
            key = "拓展用户名",
            value = feat_username
        }, {
            key = "webdav服务",
            value = webdav_running
        },
        {
            key = "webdav地址",
            value = "<a href=\""..webdav_url.."\" target=\"_blank\">"..webdav_url.."</a>"
        }, 
        {
            key = "远程开机服务",
            value = wol_running
        }, 
        {
            key = "控制台",
            value = "<a href=\"https://www.ddnsto.com/app/#/devices\" target=\"_blank\">点击前往DDNSTO控制台</a>"
        } 
    },
    title = "服务状态"
  }  
  return c1
end

local function main_container()
    local c2 = {
        properties = {
          {
            name = "enabled",
            title = "启用",
            type = "boolean"
          },
          {
            name = "token",
            required = true,
            title = "用户Token",
            type = "string",
            ["ui:options"] = {
              description = "<a href=\"https://doc.linkease.com/zh/guide/ddnsto/\" target=\"_blank\">如何获取令牌?</a>"
            }
          },
          {
            name = "index",
            enum = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, },
            enumNames = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 },
            title = "设备编号",
            type = "interger",
            ["ui:options"] = {
              description = "如有多台设备id重复，请修改此编号"
            }
          },
        },
        title = "基础设置"
      }
      return c2
end

local function getBlockDevices()
    local fs = require "nixio.fs"

    local block = io.popen("/sbin/block info", "r")
    if block then
        local rv = {}
        while true do
            local ln = block:read("*l")
            if not ln then
                break
            end

            local dev = ln:match("^/dev/(.-):")
            if dev then  
                for key, val in ln:gmatch([[(%w+)="(.-)"]]) do
                    if key:lower() == "mount" then
                        table.insert(rv, val)
                    end 
                end 
            end
        end

        block:close()

        return rv
    else
        return
    end
end

local function feat_container()
    
    local c3 = {
        description = "启用后可支持控制台的“文件管理”及“远程开机”功能 <a href=\"https://doc.linkease.com/zh/guide/ddnsto/ddnstofile.html\" target=\"_blank\">查看教程</a>",
        properties = {
          {
            name = "feat_enabled",
            title = "启用",
            type = "boolean"
          },
          {
            name = "feat_port",
            required = true,
            title = "端口",
            type = "interger",
            ["ui:hidden"] = "{{rootValue.feat_enabled !== true }}"
          },
          {
            name = "feat_username",
            required = true,
            title = "授权用户名",
            type = "string",
            ["ui:hidden"] = "{{rootValue.feat_enabled !== true }}"
          },
          {
            name = "feat_password",
            mode = "password",
            required = true,
            title = "授权用户密码",
            type = "string",
            ["ui:hidden"] = "{{rootValue.feat_enabled !== true }}"
          },
           {
            name = "feat_disk_path_selected",
            enum = getBlockDevices(),
            enumNames = getBlockDevices(),
            required = true,
            title = "共享磁盘",
            type = "string",
            ["ui:hidden"] = "{{rootValue.feat_enabled !== true }}"
          }
        },
        title = "拓展功能"
      }
    return c3
end

local function get_containers() 
    local containers = {
        status_container(),
        main_container(),
        feat_container()
    }
    return containers
end

local function get_schema()
    local actions = {
        {
            text = "保存并应用",
            type = "apply",
        }
    } 
    local schema = {
        actions = actions,
        containers = get_containers(),
        description = "DDNSTO远程控制是Koolcenter小宝开发的，支持http2的远程穿透控制插件。<br />\n            支持通过浏览器访问自定义域名访问内网设备后台、远程RDP/VNC桌面、远程文件管理等多种功能。<br />\n            详情请查看    <a href=\"https://www.ddnsto.com/\" target=\"_blank\">https://www.ddnsto.com</a>",
        title = "DDNSTO 远程控制"
    }
    return schema
end

function ddnsto_form()
    local sys  = require "luci.sys"
    local error = ""
    local scope = ""
    local success = 0

    local result = {
        data = get_data(),
        schema = get_schema()
    } 
    local response = {
            error = error,
            scope = scope,
            success = success,
            result = result,
    } 
    luci.http.prepare_content("application/json")
    luci.http.write_json(response)
end
 
function ddnsto_submit()
    local http = require "luci.http"
    local content = http.content()

    local error = ""
    local scope = ""
    local success = 0
    local log = "正在验证参数...\n"
    
    local jsonc = require "luci.jsonc"
    local json_parse = jsonc.parse
    local req = json_parse(content)

    if req == nil or next(req) == nil then
        error = "invalid request"
    else
        if req.enabled == true and isempty(req.token) then
            success = -1000
            error = "请填写正确用户Token（令牌）"
        end

        if req.token ~= nil and string.find(req.token, " ") then
            success = -1000
            error = "令牌勿包含空格"
        end
        if req.index == nil or tonumber(req.index) == nil or req.index < 0 or req.index > 99 then
            success = -1000
            error = "请填写正确的设备编号"
        end

        if req.feat_enabled == true then

            if (req.feat_port == nil or tonumber(req.feat_port) == nil or req.feat_port == 0)  then
                success = -1000
                error = "请填写正确的端口"
            end
            if isempty(req.feat_username) then
                success = -1000
                error = "请填写授权用户名"
            end
            if string.find(req.feat_username, " ") then
                success = -1000
                error = "用户名请勿包含空格"
            end
            if isempty(req.feat_password) then
                success = -1000
                error = "请填写授权用户密码"
            end
            if string.find(req.feat_password, " ") then
                success = -1000
                error = "用户密码请勿包含空格"
            end
            if isempty(req.feat_disk_path_selected) then
                success = -1000
                error = "请填写共享磁盘路径"
            end
        end 
    end

    if success == 0 then
        local uci = require "luci.model.uci".cursor()

        local enabled = "0"
        if req.enabled == true then
            enabled = "1"
        end
        uci:set("ddnsto","@ddnsto[0]","enabled",enabled)
        
        local channel = (uci:get_first("istore", "istore", "channel") or "")
        uci:set("ddnsto","@ddnsto[0]","supplier_code",channel)

        local token = ""
        if req.token then
            token = trim(req.token)
        end
        uci:set("ddnsto","@ddnsto[0]","token",token)

        local index = 0
        if req.index then
            index = req.index
        end
        uci:set("ddnsto","@ddnsto[0]","index",index)

        local f_enabled = "0"
        if req.feat_enabled == true then
            f_enabled = "1"
        end
        uci:set("ddnsto","@ddnsto[0]","feat_enabled",f_enabled)

        local port = 3033
        if req.feat_port ~= nil then
            port = req.feat_port
        end
        uci:set("ddnsto","@ddnsto[0]","feat_port",port)

        local username = ""
        if req.feat_username ~= nil then
            username = trim(req.feat_username)
        end
        uci:set("ddnsto","@ddnsto[0]","feat_username",username)

        local password = ""
        if req.feat_password ~= nil then
            password = trim(req.feat_password)
        end
        uci:set("ddnsto","@ddnsto[0]","feat_password",password)
        
        local path = ""
        if req.feat_disk_path_selected ~= nil then
            path = trim(req.feat_disk_path_selected)
        end
        uci:set("ddnsto","@ddnsto[0]","feat_disk_path_selected",path)
        uci:commit("ddnsto")  
    end
        
    
    if success == 0 then     
        log = log .. "正在保存参数...\n"
        log = log .. "保存成功!\n"
        log = log .. "请关闭对话框\n" 
        
        luci.util.exec("/etc/init.d/ddnsto stop") 
        luci.util.exec("/etc/init.d/ddnsto start")
        luci.util.exec("sleep 1")
    else
        log = log .. "参数错误：\n"
        log = log .. "\n"
        log = log .. error .."\n"
        log = log .. "\n"
        log = log .. "保存失败！\n"
        log = log .. "请关闭对话框\n" 
        luci.util.exec("sleep 1")
    end
 
    
    local result = {
        async = false,
        log = log,
        data = get_data(),
        schema = get_schema()
    } 
    local response = {
        success = 0,
        result = result,
    } 
    http.prepare_content("application/json")
    http.write_json(response)
end

function ddnsto_log()
    local http = require "luci.http" 
    local fs   = require "nixio.fs"
    local data = fs.readfile("/tmp/ddnsto/ddnsto-luci.log")

    http.prepare_content("text/plain;charset=utf-8")
    http.write(data)
end

function ddnsto_status()
        local sys  = require "luci.sys"
        local status = {
                running = (sys.call("pidof ddnstod >/dev/null") == 0)
        }

        luci.http.prepare_content("application/json")
        luci.http.write_json(status)
end

local page_index = {"admin", "services", "ddnsto", "pages"}
function redirect_index()
    luci.http.redirect(luci.dispatcher.build_url(unpack(page_index)))
end

function ddnsto_index()
    luci.template.render("ddnsto/main", {prefix=luci.dispatcher.build_url(unpack(page_index))})
end

function ddnsto_dev()
    luci.template.render("ddnsto/main_dev", {prefix=luci.dispatcher.build_url(unpack({"admin", "services", "ddnsto", "dev"}))})
end