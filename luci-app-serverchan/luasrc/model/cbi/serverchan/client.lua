f = SimpleForm("serverchan")
f.reset = false
f.submit = false

local o = require "luci.dispatcher"
local fs = require "nixio.fs"
local jsonc = require "luci.jsonc"
local sys = require "luci.sys"

local sessions = {}
local session_path = "/var/serverchan/client"
if fs.access(session_path) then
    for filename in fs.dir(session_path) do
        local session_file = session_path .. "/" .. filename
        local file = io.open(session_file, "r")
        local t = jsonc.parse(file:read("*a"))
        if t then
            t.session_file = session_file
            sessions[#sessions + 1] = t
        end
        file:close()
    end
end

local client_count = sys.exec("cat /tmp/serverchan/ipAddress | wc -l")
t = f:section(Table, sessions, translate("当前共 ".. client_count .. "台设备在线"))
t:option(DummyValue, "name", translate("主机名"))
t:option(DummyValue, "mac", translate("MAC"))
t:option(DummyValue, "ip", translate("IP"))
t:option(DummyValue, "usage", translate("总计流量"))
t:option(DummyValue, "uptime", translate("在线时间"))

 
return f
