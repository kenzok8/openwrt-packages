local ipc = require "luci.ip"
local sys = require "luci.sys"

local m = Map("eqos", translate("Quality of Service"))

local global_section = m:section(NamedSection, "global", "eqos", translate("Global Settings"))
global_section.addremove = false
global_section.cfgsections = {"global"}

local enabled = global_section:option(Flag, "enabled", translate("Enable EQOS"))
enabled.rmempty = false

local wan_device = global_section:option(Value, "wan", translate("WAN Device"))
wan_device.datatype = "network"
wan_device.default = "wan"

local dl_speed = global_section:option(Value, "download", translate("Download Speed (Mbit/s)"), translate("Total bandwidth"))
dl_speed.datatype = "and(uinteger,min(1))"
dl_speed.default = "100"

local ul_speed = global_section:option(Value, "upload", translate("Upload Speed (Mbit/s)"), translate("Total bandwidth"))
ul_speed.datatype = "and(uinteger,min(1))"
ul_speed.default = "50"

local device_section = m:section(TypedSection, "device", translate("Speed Limit by IP Address"))
device_section.template = "cbi/tblsection"
device_section.anonymous = true
device_section.addremove = true

local ip_addr = device_section:option(Value, "ip", translate("IP Address"))
ip_addr.datatype = "ipaddr"
ip_addr.placeholder = "192.168.1.100"

ipc.neighbors({family = 4, dev = "br-lan"}, function(n)
	if n.mac and n.dest then
		ip_addr:value(n.dest:string(), "%s (%s)" %{ n.dest:string(), n.mac })
	end
end)

local dl_limit = device_section:option(Value, "download", translate("Download (Mbit/s)"))
dl_limit.datatype = "and(uinteger,min(1))"
dl_limit.placeholder = "10"

local ul_limit = device_section:option(Value, "upload", translate("Upload (Mbit/s)"))
ul_limit.datatype = "and(uinteger,min(1))"
ul_limit.placeholder = "5"

local comment = device_section:option(Value, "comment", translate("Comment"))
comment.placeholder = translate("Description")

return m
