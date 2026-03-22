local sys = require "luci.sys"
local fs = require "nixio.fs"

local m, s, o

m = Map("aliddns", translate("AliDDNS"))

s = m:section(TypedSection, "base", translate("Base"))
s.anonymous = true

o = s:option(Flag, "enable", translate("Enable"))
o.rmempty = false

o = s:option(Flag, "clean", translate("Clean Before Update"))
o.rmempty = false

o = s:option(Flag, "ipv4", translate("Enable IPv4"))
o.rmempty = false

o = s:option(Flag, "ipv6", translate("Enable IPv6"))
o.rmempty = false

o = s:option(Value, "app_key", translate("Access Key ID"))
o.password = true

o = s:option(Value, "app_secret", translate("Access Key Secret"))
o.password = true

o = s:option(
	ListValue,
	"interface",
	translate("WAN-IP Source"),
	translate("Select the WAN-IP Source for AliDDNS, like wan/internet")
)
o:value("", translate("Select WAN-IP Source"))
o:value("internet", translate("Internet"))
o:value("wan")
o.rmempty = false

o = s:option(
	ListValue,
	"interface6",
	translate("WAN6-IP Source"),
	translate("Select the WAN6-IP Source for AliDDNS, like wan6/internet")
)
o:value("", translate("Select WAN6-IP Source"))
o:value("internet", translate("Internet"))
o:value("wan")
o:value("wan6")
o:value("wan_6")
o.rmempty = true

o = s:option(Value, "main_domain", translate("Main Domain"),
	translate("For example: test.github.com -> github.com"))
o.rmempty = false

o = s:option(Value, "sub_domain", translate("Sub Domain"),
	translate("For example: test.github.com -> test"))
o.rmempty = false

o = s:option(Value, "time", translate("Inspection Time"),
	translate("Unit: Minute, Range: 1-59"))
o.default = "10"
o.datatype = "range(1,59)"
o.rmempty = false

s = m:section(TypedSection, "base", translate("Update Log"))
s.anonymous = true

local log_path = "/var/log/aliddns.log"

o = s:option(TextValue, "sylogtext")
o.rows = 16
o.readonly = "readonly"
o.wrap = "off"
o.cfgvalue = function(self, section)
	if fs.access(log_path) then
		return sys.exec("tail -n 100 " .. log_path) or ""
	end
	return ""
end

o.write = function(self, section, value)
end

if luci.http.formvalue("cbi.apply") then
	sys.call("/etc/init.d/aliddns restart >/dev/null 2>&1 &")
end

return m
