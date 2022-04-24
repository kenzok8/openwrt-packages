--wulishui <wulishui@gmail.com> ,20200911
--jjm2473 <jjm2473@gmail.com> ,20210127

local m, s

m = Map("linkease", translate("LinkEase"), translate("LinkEase is an efficient data transfer tool."))

m:section(SimpleSection).template  = "linkease_status"

s=m:section(TypedSection, "linkease", translate("Global settings"))
s.addremove=false
s.anonymous=true

s:option(Flag, "enabled", translate("Enable")).rmempty=false

s:option(Value, "port", translate("Port")).rmempty=false

return m


