local i = require "luci.sys"
local t, e, o
local button = ""
local state_msg = ""
local running=(luci.sys.call("cat /etc/crontabs/root |grep etherwake >/dev/null") == 0)
local button = ""
local state_msg = ""
if running then
        state_msg = "<b><font color=\"green\">" .. translate("正在运行") .. "</font></b>"
else
        state_msg = "<b><font color=\"red\">" .. translate("没有运行") .. "</font></b>"
end

t = Map("timewol", translate("定时网络设备唤醒"), translate("<b>利用“计划任务”来定时唤醒局域网中的设备的工具。计划任务设置可参考<input class=\"cbi-button cbi-button-apply\" type=\"submit\" value=\" "..
translate("“查看/验证”").." \" onclick=\"window.open('https://tool.lu/crontab/')\"/></b>") .. button .. "<br/><br/>" .. 
translate("运行状态").. " : "  .. state_msg .. "<br />"
)

e = t:section(TypedSection, "basic", translate(""))
e.anonymous = true
o = e:option(Flag, "enabled", translate("功能开关"))
o.rmempty = false

a = e:option(ListValue, "tool", translate("唤醒工具"), translate("有时候可能需要尝试其中某一个工具才能确定正常工作，wakeonlan需要自行安装"))
a:value("etherwake", "etherwake")
a:value("wakeonlan", "wakeonlan")
a.default = "etherwake"

e = t:section(TypedSection, "macclient", translate(""))
e.template = "cbi/tblsection"
e.anonymous = true
e.addremove = true

a = e:option(Flag, "enable", translate("开启"))
a.rmempty = false
a.default = '1'

nolimit_mac = e:option(Value, "macaddr", translate("被唤醒的设备MAC"))
nolimit_mac.rmempty = false
i.net.mac_hints(function(e, t) nolimit_mac:value(e, "%s (%s)" % {e, t}) end)

a = e:option(Value, "maceth", translate("网络接口"))
a.rmempty = false
a.default = "br-lan"
for t, e in ipairs(i.net.devices()) do if e ~= "lo" then a:value(e) end end

a = e:option(Value, "month", translate("月<font color=\"green\">(数值范围1～12)</font>"))
a.optional = false
a.default = '*'

a = e:option(Value, "day", translate("日<font color=\"green\">(数值范围1～31)</font>"))
a.optional = false
a.default = '*'

a = e:option(Value, "weeks", translate("星期<font color=\"green\">(数值范围0～6)</font>"))
a.optional = false
a.default = '*'

a = e:option(Value, "hour", translate("时<font color=\"green\">(数值范围0～23)</font>"))
a.optional = false
a.default = '05'

a = e:option(Value, "minute", translate("分<font color=\"green\">(数值范围0～59)</font>"))
a.optional = false
a.default = '00'

return t


