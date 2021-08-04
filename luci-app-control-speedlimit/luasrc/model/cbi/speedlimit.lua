local sys = require "luci.sys"
--Author: wulishui <wulishui@gmail.com>
local button = ""
local state_msg = ""
local m,s,n
local running=(luci.sys.call("[ `(tc qdisc show dev br-lan | head -1) 2>/dev/null | grep -c 'default' 2>/dev/null` -gt 0 ] > /dev/null") == 0)

if running then
	state_msg = "<b><font color=\"green\">" .. translate("已运行") .. "</font></b>"
else
	state_msg = "<b><font color=\"red\">" .. translate("未运行") .. "</font></b>"
end

m = Map("speedlimit", translate("速度限制"))
m.description = translate("可以通过MAC，IP，IP段，IP范围限制用户上传/下载的网速。<br>速度单位是（<b><font color=\"green\">MB/秒</font></b>），速度值 0 时为无限制。").. button .. "<br/><br/>" .. translate("运行状态 ：") .. state_msg .. "<br />"

s = m:section(TypedSection, "usrlimit")
s.template = "cbi/tblsection"
s.anonymous = true
s.addremove = true
s.sortable  = true

e = s:option(Flag, "enable", translate("Enable"))
e.rmempty = false

usr = s:option(Value, "usr",translate("选择限制的用户（<font color=\"green\">MAC支持 : 或 - 分割</font>）"))
sys.net.mac_hints(function(mac, name)
	usr:value(mac, "%s (%s)" %{ mac, name })
end)
usr.size = 8

dl = s:option(Value, "download", translate("下载速度"))
dl.rmempty = false
dl.size = 8

ul = s:option(Value, "upload", translate("上传速度"))
ul.rmempty = false
ul.size = 8

comment = s:option(Value, "comment", translate("备注"))
ul.rmempty = false
comment.size = 8

return m
