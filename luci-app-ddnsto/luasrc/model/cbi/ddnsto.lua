--wulishui <wulishui@gmail.com> ,20200911
--jjm2473 <jjm2473@gmail.com> ,20210127

local m, s

m = Map("ddnsto", translate("DDNS.to"), translate("DDNS.to is a reverse proxy.")
	.. " <a href=\"https://www.ddnsto.com/\" onclick=\"void(0)\" target=\"_blank\">"
	.. translate("Official Website")
	.. "</a>")

m:section(SimpleSection).template  = "ddnsto_status"

s=m:section(TypedSection, "ddnsto", translate("Global settings"))
s.addremove=false
s.anonymous=true

s:option(Flag, "enabled", translate("Enable")).rmempty=false

s:option(Value, "token", translate("Token")).rmempty=false

return m


