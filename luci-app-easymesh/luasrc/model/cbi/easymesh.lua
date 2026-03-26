-- Copyright (C) 2021 dz <dingzhong110@gmail.com>

local m, s, o
local sys = require "luci.sys"
local uci = require "luci.model.uci".cursor()
local util = require "luci.util"

m = Map("easymesh")

local function detect_Node()
	local data = {}
	local cmd = "batctl n 2>/dev/null | tail -n +2 | sed 's/^[ ]*//g' | sed 's/[ ]*/ /g'"
	local fp = io.popen(cmd)
	if not fp then return data end
	for line in fp:lines() do
		local pos = string.find(line, " ")
		if pos then
			local ifa = string.sub(line, 1, pos - 1)
			local rest = string.sub(line, pos + 1)
			pos = string.find(rest, " ")
			if pos then
				local neighbor = string.sub(rest, 1, pos - 1)
				rest = string.sub(rest, pos + 1)
				pos = string.find(rest, " ")
				if pos then
					local lastseen = string.sub(rest, 1, pos - 1)
					table.insert(data, { IF = ifa, Neighbor = neighbor, lastseen = lastseen })
				end
			end
		end
	end
	fp:close()
	return data
end

local Nodes = sys.exec("batctl n 2>/dev/null | tail -n +2 | wc -l")
local Node = detect_Node()
local v = m:section(Table, Node, "", "<b>" .. translate("Active node") .. "：" .. Nodes .. "</b>")
v:option(DummyValue, "IF", translate("IF"))
v:option(DummyValue, "Neighbor", translate("Neighbor"))
v:option(DummyValue, "lastseen", translate("lastseen"))

s = m:section(TypedSection, "easymesh", translate("Settings"), translate("General Settings"))
s.anonymous = true

o = s:option(Flag, "enabled", translate("Enable"), translate("Enable or disable EASY MESH"))
o.default = "0"
o.rmempty = false

o = s:option(ListValue, "role", translate("role"))
o:value("off", translate("off"))
o:value("server", translate("host MESH"))
o:value("client", translate("son MESH"))
o.rmempty = false

local apRadio = s:option(ListValue, "apRadio", translate("MESH Radio device"), translate("The radio device which MESH use"))
uci:foreach("wireless", "wifi-device",
	function(sect)
		apRadio:value(sect['.name'])
	end)
apRadio:value("all", translate("ALL"))
apRadio.default = "radio0"
apRadio.rmempty = false

o = s:option(Value, "mesh_id", translate("MESH ID"))
o.default = "easymesh"
o.description = translate("MESH ID")

o = s:option(Flag, "encryption", translate("Encryption"), "")
o.default = "0"
o.rmempty = false

o = s:option(Value, "key", translate("Key"))
o.default = "easymesh"
o:depends("encryption", "1")

o = s:option(Flag, "kvr", translate("K/V/R"), "")
o.default = "1"
o.rmempty = false

o = s:option(Value, "mobility_domain", translate("Mobility Domain"), translate("4-character hexadecimal ID"))
o.default = "4f57"
o.datatype = "and(hexstring,rangelength(4,4))"
o:depends("kvr", "1")

o = s:option(Value, "rssi_val", translate("Threshold for a good RSSI"))
o.default = "-60"
o.datatype = "range(-120,-1)"
o:depends("kvr", "1")

o = s:option(Value, "low_rssi_val", translate("Threshold for a bad RSSI"))
o.default = "-88"
o.datatype = "range(-120,-1)"
o:depends("kvr", "1")

o = s:option(Flag, "ap_mode", translate("AP MODE Enable"), translate("Enable or disable AP MODE"))
o.default = "0"
o.rmempty = false

o = s:option(Value, "ipaddr", translate("IPv4-Address"))
o.default = "192.168.1.10"
o.datatype = "ip4addr"
o:depends("ap_mode", "1")

o = s:option(Value, "netmask", translate("IPv4 netmask"))
o.default = "255.255.255.0"
o.datatype = "ip4addr"
o:depends("ap_mode", "1")

o = s:option(Value, "gateway", translate("IPv4 gateway"))
o.default = "192.168.1.1"
o.datatype = "ip4addr"
o:depends("ap_mode", "1")

o = s:option(Value, "dns", translate("Use custom DNS servers"))
o.default = "192.168.1.1"
o.datatype = "ip4addr"
o:depends("ap_mode", "1")

return m
