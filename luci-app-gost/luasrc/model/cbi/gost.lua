-- Copyright (C) 2025 ImmortalWrt.org
-- SPDX-License-Identifier: Apache-2.0

local sys = require "luci.sys"

m = Map("gost", translate("GOST"),
	translate("A simple security tunnel written in Golang."))

-- 服务运行状态提示
local running = (sys.call("pidof gost >/dev/null 2>&1") == 0)
local status_text = running
	and '<span style="color:green"><strong>' .. translate("RUNNING") .. "</strong></span>"
	or  '<span style="color:red"><strong>' .. translate("NOT RUNNING") .. "</strong></span>"

s = m:section(TypedSection, "gost", translate("Service Status"))
s.anonymous = true
s.addremove  = false

o = s:option(DummyValue, "_status", translate("Status"))
o.rawhtml = true
o.default = status_text

-- 基本设置
s = m:section(NamedSection, "config", "gost", translate("Basic Settings"))
s.anonymous  = false
s.addremove  = false

o = s:option(Flag, "enabled", translate("Enable"))
o.rmempty = false

o = s:option(Value, "config_file", translate("Configuration file"))
o:value("/etc/gost/gost.json")
o.datatype = "file"
o.rmempty = true

o = s:option(DynamicList, "arguments", translate("Arguments"))
o.rmempty = true
function o.validate(self, value, section)
	local config_file = m:get(section, "config_file")
	if not config_file or config_file == "" then
		if not value or value == "" then
			return nil, translatef("Expecting: %s", translate("non-empty value"))
		end
	end
	return value
end

return m
