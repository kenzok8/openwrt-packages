-- Copyright (C) 2021-2022  sirpdboy  <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-lucky

local m, s ,o

m = Map("lucky")
m.title = translate("Lucky")
m.description = translate("Main functions of Lucky: dynamic domain name ddns-go service, which replaces socat. It is mainly used for public IPv6 tcp/udp to intranet ipv4, http/https reverse proxy frp")..translate("</br>For specific usage, see:")..translate("<a href=\'https://github.com/sirpdboy/luci-app-lucky.git' target=\'_blank\'>GitHub @sirpdboy/luci-app-lucky </a>。")

m:section(SimpleSection).template  = "lucky_status"

s = m:section(TypedSection, "lucky", translate("Global Settings"))
s.addremove=false
s.anonymous=true

o = s:option(Flag,"enabled",translate("Enable"))
o.default=0

o = s:option(Value, "port",translate("Set the Lucky access port"))
o.datatype = "uinteger"
o.default = 16601

o = s:option(Flag, "AllowInternetaccess", translate("Enable Internet access"))
o.default=0

o = s:option(Button, "lucky_admin", translate("View Password"))
o.rawhtml = true
o.template = "lucky_admin"

m.apply_on_parse = true
m.on_after_apply = function(self,map)
	luci.sys.exec("/etc/init.d/lucky restart")
end

return m
