-- Copyright (C) 2021-2022  sirpdboy  <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-lucky

local m, s ,o

m = Map("lucky")
m.title = translate("Lucky")
m.description = translate("ipv4/ipv6 portforward,ddns,reverseproxy proxy,wake on lan,IOT and more,Default username and password 666")

m:section(SimpleSection).template  = "lucky_status"

s = m:section(TypedSection, "lucky", translate("Global Settings"))
s.addremove=false
s.anonymous=true

o = s:option(Flag,"enabled",translate("Enable"))
o.default=0

o = s:option(Value, "port",translate("Set the Lucky access port"))
o.datatype = "uinteger"
o.default = 16601

o = s:option(Value, "safe",translate("Safe entrance"),translate("The panel management portal can only be set to log in to the panel through the specified security portal, such as:/lucky"))

o = s:option( Value, "configdir", translate("Config dir path"),translate("The path to store the config file"))
o.placeholder = "/etc/lucky"
o.default="/etc/lucky"

m.apply_on_parse = true
m.on_after_apply = function(self,map)
	luci.sys.exec("/etc/init.d/lucky restart")
end

return m
