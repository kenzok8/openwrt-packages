--wulishui <wulishui@gmail.com> ,20200911
--jjm2473 <jjm2473@gmail.com> ,20210127

local m, s, o

m = Map("ddnsto", translate("DDNS.to"), translate("DDNS.to is a reverse proxy service.")
	.. " <a href=\"https://www.ddnsto.com/\" onclick=\"void(0)\" target=\"_blank\">"
	.. translate("Official Website")
	.. "</a>")

m:section(SimpleSection).template  = "ddnsto_status"

s=m:section(TypedSection, "ddnsto", translate("Global settings"))
s.addremove=false
s.anonymous=true

s:option(Flag, "enabled", translate("Enable")).rmempty=false

s:option(Value, "token", translate("Token")).rmempty=false

o = s:option(Value, "index", translate("Device Index"))
o.default = "0"
o.datatype = "uinteger"
o.rmempty = false

o = s:option(Flag, "logger", translate("Enable Logging"))
o.default = "0"
o.rmempty = false

-- WebDAV/File Sharing settings
s2=m:section(TypedSection, "ddnsto", translate("WebDAV File Sharing"))
s2.addremove=false
s2.anonymous=true

o = s2:option(Flag, "feat_enabled", translate("Enable WebDAV"))
o.default = "0"
o.rmempty = false

o = s2:option(Value, "feat_port", translate("WebDAV Port"))
o.default = "3033"
o.datatype = "port"
o.rmempty = false
o:depends("feat_enabled", "1")

o = s2:option(Value, "feat_username", translate("Username"))
o.rmempty = false
o:depends("feat_enabled", "1")

o = s2:option(Value, "feat_password", translate("Password"))
o.password = true
o.rmempty = false
o:depends("feat_enabled", "1")

o = s2:option(Value, "feat_disk_path_selected", translate("Shared Path"))
o.rmempty = false
o:depends("feat_enabled", "1")

return m
