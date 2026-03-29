-- luci-app-openclaw — CBI Model (18.06 compat)
local sys = require "luci.sys"

m = Map("openclaw", "OpenClaw AI Gateway",
	translate("AI gateway supporting 12+ model providers and multiple messaging channels."))

-- Status panel
m:section(SimpleSection).template = "openclaw/status"

-- Basic settings
s = m:section(NamedSection, "main", "openclaw", translate("Basic Settings"))
s.addremove = false
s.anonymous = true

o = s:option(Flag, "enabled", translate("Enable Service"))
o.rmempty = false

o = s:option(Value, "port", translate("Gateway Port"))
o.datatype = "port"
o.default = "18789"
o.rmempty = false

o = s:option(ListValue, "bind", translate("Listen Interface"))
o:value("lan", "LAN")
o:value("loopback", "Loopback")
o:value("all", translate("All Interfaces"))
o.default = "lan"

o = s:option(Value, "pty_port", translate("PTY Port"))
o.datatype = "port"
o.default = "18793"
o.rmempty = false

return m
