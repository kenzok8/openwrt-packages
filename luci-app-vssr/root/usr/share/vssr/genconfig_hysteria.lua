local ucursor = require 'luci.model.uci'.cursor()
local json = require 'luci.jsonc'
local server_section = arg[1]
local proto = arg[2]
local local_port = arg[3]
local server = ucursor:get_all('vssr', server_section)

local hysteria = {
    server = server.server .. ":" .. tonumber(server.server_port),
    obfs = server.h_obfs,
    up_mbps = tonumber(server.h_up_mbps),
    down_mbps = tonumber(server.h_down_mbps),
    insecure = (server.insecure == '1') and true or false,
    retry = 3,
    protocol = tostring(server.h_protocol),
}

if server.h_server_name ~= nil then
    hysteria["server_name"] = tostring(server.h_server_name)
end

if proto == "tcp" then
    hysteria["redirect_tcp"] = {
        listen = ":" .. local_port,
        timeout = 300
    }
else
    hysteria["tproxy_udp"] = {
        listen = ":" .. local_port,
        timeout = 60
    }
end

print(json.stringify(hysteria, 1))
