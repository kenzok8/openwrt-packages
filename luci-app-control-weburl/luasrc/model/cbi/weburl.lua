local o = require "luci.sys"
local a, t, e
local button = ""
local state_msg = ""
local running=(luci.sys.call("iptables -L FORWARD|grep WEBURL >/dev/null") == 0)
local button = ""
local state_msg = ""
if running then
        state_msg = "<b><font color=\"green\">" .. translate("正在运行") .. "</font></b>"
else
        state_msg = "<b><font color=\"red\">" .. translate("没有运行") .. "</font></b>"
end
a = Map("weburl", translate("网址过滤/关键字过滤/MAC黑名单/时间控制/端口控制"), translate("<b><font color=\"green\">利用iptables来单独或组合使用多种条件过滤。条件除特别说明外都可以留空不使用。</font> </b></br>* 如指定“关键词/URL”（MAC黑名单、时间、星期可选）则为关键字过滤，关键字可以是字符串或网址。</br>* 如指定“MAC黑名单”而“关键词/URL”留空则为纯MAC黑名单模式（如已改变默认时间或星期则成为时间控制）。</br>* 如指定端口（MAC黑名单、时间、星期可选）则禁止通过此端口联网。端口可以是端口范围如5000:5100或多端口5100,5110。" .. button  .. "<br/><br/>" .. translate("运行状态").. " : "  .. state_msg .. "<br />"))
t = a:section(TypedSection, "basic", translate(""), translate(""))
t.anonymous = true
e = t:option(Flag, "enabled", translate("开启功能"))
e.rmempty = false
e = t:option(ListValue, "algos", translate("过滤力度"))
e:value("bm", "一般过滤")
e:value("kmp", "强效过滤")
e.default = "kmp"
t = a:section(TypedSection, "macbind", translate(""))
t.template = "cbi/tblsection"
t.anonymous = true
t.addremove = true
e = t:option(Flag, "enable", translate("开启"))
e.rmempty = false
e.default = '1'
e = t:option(Value, "macaddr", translate("黑名单MAC<font color=\"green\">(留空则过滤全部客户端)</font>"))
e.rmempty = true
o.net.mac_hints(function(t, a) e:value(t, "%s (%s)" % {t, a}) end)
e = t:option(Value, "keyword", translate("关键词/URL<font color=\"green\">(可留空)</font>"))
e.rmempty = true
e = t:option(ListValue, "proto", translate("<font color=\"gray\">端口协议</font>"))
e.rmempty = false
e.default = 'tcp'
e:value("tcp", translate("TCP"))
e:value("udp", translate("UDP"))
e = t:option(Value, "sport", translate("<font color=\"gray\">源端口</font>"))
e.rmempty = true
e = t:option(Value, "dport", translate("<font color=\"gray\">目的端口</font>"))
e.rmempty = true
e = t:option(Value, "timeon", translate("起控时间"))
e.placeholder = "00:00"
e.default = '00:00'
e.rmempty = true
e = t:option(Value, "timeoff", translate("停控时间"))
e.placeholder = "00:00"
e.default = '00:00'
e.rmempty = true
e = t:option(MultiValue, "daysofweek", translate("星期<font color=\"green\">(至少选一天，某天不选则该天不进行控制)</font>"))
e.optional = false
e.rmempty = false
e.default = 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'
e:value("Monday", translate("一"))
e:value("Tuesday", translate("二"))
e:value("Wednesday", translate("三"))
e:value("Thursday", translate("四"))
e:value("Friday", translate("五"))
e:value("Saturday", translate("六"))
e:value("Sunday", translate("日"))
return a



