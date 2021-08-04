local o = require "luci.sys"
local a, e, t, s
local button = ""
local state_msg = ""
local m,s,n
local running=(luci.sys.call("[ `iptables -L FORWARD|grep 'SWOBL'|wc -l 2>/dev/null` -gt 0 ] && [ `iptables -L SWOBL|grep 'webrestriction'|wc -l 2>/dev/null` -gt 0 ]> /dev/null") == 0)
local button = ""
local state_msg = ""

if running then
        state_msg = "<b><font color=\"green\">" .. translate("正在运行") .. "</font></b>"
else
        state_msg = "<b><font color=\"red\">" .. translate("没有运行") .. "</font></b>"
end

a = Map("webrestriction", translate("访问限制"), translate("“名单控制”的简化版，仅能使用MAC黑名单或者MAC白名单模式控制列表中的客户端联网，而无其他高级功能。").. button .. "<br/><br/>" .. translate("运行状态").. " : "  .. state_msg .. "<br />")
e = a:section(TypedSection, "basic", translate(""))
e.anonymous = true
t = e:option(Flag, "enable", translate("开启（<font color=\"green\">总开关</font>）") , translate(""))
t.rmempty = false

t = e:option(ListValue, "limit_type", translate("限制模式"))
t.default = "blacklist"
t:value("whitelist", translate("白名单（仅允许名单内用户联网）"))
t:value("blacklist", translate("黑名单（仅禁止名单内用户联网）"))
t.rmempty = false

--------------------------------------------------------
    e.template = "cbi/tblsection"

    function validate_time(self, value, section)
        local hh, mm, ss
        hh, mm, ss = string.match (value, "^(%d?%d):(%d%d)$")
        hh = tonumber (hh)
        mm = tonumber (mm)
        if hh and mm and hh <= 23 and mm <= 59 then
            return value
        else
            return nil, "时间格式必须为 HH:MM 或者留空"
        end
    end
    t = e:option(Value, "start_time", translate("开始时间<font color=\"green\">(格式 HH:MM)</font>"))
        t.default = '00:00'
        t.rmempty = true
        t.validate = validate_time 
        t.size = 5
    t = e:option(Value, "stop_time", translate("停止时间<font color=\"green\">(格式 HH:MM)</font>")) 
        t.default = '00:00'
        t.rmempty = true
        t.validate = validate_time
        t.size = 5

    t = e:option(MultiValue, "daysofweek", translate("星期<font color=\"green\">(至少选一天，某天不选则该天不进行控制)</font>"))
        t.optional = false
        t.rmempty = false
        t:value("Monday", translate("一"))
        t:value("Tuesday", translate("二"))
        t:value("Wednesday", translate("三"))
        t:value("Thursday", translate("四"))
        t:value("Friday", translate("五"))
        t:value("Saturday", translate("六"))
        t:value("Sunday", translate("日"))
-----------------


e = a:section(TypedSection, "macbind", translate(""))
e.template = "cbi/tblsection"
e.anonymous = true
e.addremove = true
t = e:option(Flag, "enable", translate("开启控制"))
t.rmempty = false
t = e:option(Value, "macaddr", translate("MAC地址"))
t.rmempty = true
o.net.mac_hints(function(e, a) t:value(e, "%s (%s)" % {e, a}) end)
comment = e:option(Value, "comment", translate("备注（名称）"))
e = luci.http.formvalue("cbi.apply")
if e then
  io.popen("/etc/init.d/webrestriction start")
end

return a




