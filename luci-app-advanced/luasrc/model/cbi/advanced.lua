local e=require"nixio.fs"
local t=require"luci.sys"
local t=luci.model.uci.cursor()
m=Map("advanced",translate("高级进阶设置"),translate("<font color=\"Red\"><strong>配置文档是直接编辑的除非你知道自己在干什么，否则请不要轻易修改这些配置文档。配置不正确可能会导致不能开机等错误。</strong></font><br/>"))
m.apply_on_parse=true
s=m:section(TypedSection,"advanced")
s.anonymous=true

if nixio.fs.access("/bin/nuc")then
  s:tab("mode",translate("模式设置"),translate("<br />可以在这里切换旁路由和正常模式，重置你的网络设置。<br /><font color=\"Red\"><strong>点击后会立即重启设备，没有确认过程，请谨慎操作！</strong></font><br/>"))
  o=s:taboption("mode",Button,"nucmode",translate("切换为旁路由模式"),translate("<font color=\"green\"><strong>本模式适合于单口和多网口主机，自动将网口全桥接好！<br />默认gateway是：192.168.1.1，ipaddr是192.168.1.2。用本机接口LAN接上级LAN当旁路由，主路由关闭DHCP服务。应用生效会重启软路由！</strong></font><br/>"))
  o.inputtitle = translate("Apply")
  o.inputstyle = "reset"
  o.write = function()
    luci.sys.exec("/bin/nuc &> /dev/null &")
  end
  o=s:taboption("mode",Button,"normalmode",translate("切换成路由模式"),translate("<font color=\"green\"><strong>本模式适合于有两个网口或以上的设备使用，如多网口软路由或者虚拟了两个以上网口的虚拟机使用！应用生效会重启软路由！。</strong></font><br/>"))
  o.inputtitle = translate("Apply")
  o.inputstyle = "reset"
  o.write = function()
   luci.sys.exec("/bin/normalmode &> /dev/null &")
  end

	o=s:taboption("mode",Button,"ipmode6",translate("设置为IPV6网络"),translate("<font color=\"green\"><strong>点击应用切换到IPV6模式！保存应用后即刻有效！</strong></font><br/>"))

	o.inputtitle = translate("Apply")
	o.inputstyle = "add"
	o.write = function(self, section)
  		luci.sys.exec("ipmode6  &> /dev/null &")
	end

	o=s:taboption("mode",Button,"ipmode4",translate("设置为IPV4网络"),translate("<font color=\"green\"><strong>点击应用切换到IPV4模式！保存应用后即刻有效！</strong></font><br/>"))

	o.inputtitle = translate("Apply")
	o.inputstyle = "add"
	o.write = function(self, section)
  		luci.sys.exec("ipmode4  &> /dev/null &")
	end

end
if nixio.fs.access("/etc/dnsmasq.conf")then

s:tab("dnsmasqconf",translate("dnsmasq"),translate("本页是配置/etc/dnsmasq.conf的文档内容。应用保存后自动重启生效"))

conf=s:taboption("dnsmasqconf",Value,"dnsmasqconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/dnsmasq.conf")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/dnsmasq.conf",t)
if(luci.sys.call("cmp -s /tmp/dnsmasq.conf /etc/dnsmasq.conf")==1)then
e.writefile("/etc/dnsmasq.conf",t)
luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null")
end
e.remove("/tmp/dnsmasq.conf")
end
end
end
if nixio.fs.access("/etc/config/network")then
s:tab("netwrokconf",translate("网络"),translate("本页是配置/etc/config/network包含网络配置文档内容。应用保存后自动重启生效"))
conf=s:taboption("netwrokconf",Value,"netwrokconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/network")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/network",t)
if(luci.sys.call("cmp -s /tmp/network /etc/config/network")==1)then
e.writefile("/etc/config/network",t)
luci.sys.call("/etc/init.d/network restart >/dev/null")
end
e.remove("/tmp/network")
end
end
end
if nixio.fs.access("/etc/config/wireless")then
s:tab("wirelessconf",translate("无线"), translate("本页是/etc/config/wireless的配置文件内容，应用保存后自动重启生效."))

conf=s:taboption("wirelessconf",Value,"wirelessconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/wireless")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/etc/config/wireless.tmp",t)
if(luci.sys.call("cmp -s /etc/config/wireless.tmp /etc/config/wireless")==1)then
e.writefile("/etc/config/wireless",t)
luci.sys.call("wifi reload >/dev/null &")
end
e.remove("/tmp//tmp/wireless.tmp")
end
end
end

if nixio.fs.access("/etc/hosts")then
s:tab("hostsconf",translate("hosts"),translate("本页是配置/etc/hosts的文档内容。应用保存后自动重启生效"))

conf=s:taboption("hostsconf",Value,"hostsconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/hosts")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/hosts.tmp",t)
if(luci.sys.call("cmp -s /tmp/hosts.tmp /etc/hosts")==1)then
e.writefile("/etc/hosts",t)
luci.sys.call("/etc/init.d/dnsmasq restart >/dev/null")
end
e.remove("/tmp/hosts.tmp")
end
end
end
if nixio.fs.access("/etc/config/arpbind")then
s:tab("arpbindconf",translate("ARP绑定"),translate("本页是配置/etc/config/arpbind包含APR绑定MAC地址文档内容。应用保存后自动重启生效"))
conf=s:taboption("arpbindconf",Value,"arpbindconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/arpbind")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/arpbind",t)
if(luci.sys.call("cmp -s /tmp/arpbind /etc/config/arpbind")==1)then
e.writefile("/etc/config/arpbind",t)
luci.sys.call("/etc/init.d/arpbind restart >/dev/null")
end
e.remove("/tmp/arpbind")
end
end
end
if nixio.fs.access("/etc/config/firewall")then
s:tab("firewallconf",translate("防火墙"),translate("本页是配置/etc/config/firewall包含防火墙协议设置文档内容。应用保存后自动重启生效"))
conf=s:taboption("firewallconf",Value,"firewallconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/firewall")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/firewall",t)
if(luci.sys.call("cmp -s /tmp/firewall /etc/config/firewall")==1)then
e.writefile("/etc/config/firewall",t)
luci.sys.call("/etc/init.d/firewall restart >/dev/null")
end
e.remove("/tmp/firewall")
end
end
end
if nixio.fs.access("/etc/config/mwan3")then
s:tab("mwan3conf",translate("负载均衡"),translate("本页是配置/etc/config/mwan3包含负载均衡设置文档内容。应用保存后自动重启生效"))
conf=s:taboption("mwan3conf",Value,"mwan3conf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/mwan3")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/mwan3",t)
if(luci.sys.call("cmp -s /tmp/mwan3 /etc/config/mwan3")==1)then
e.writefile("/etc/config/mwan3",t)
luci.sys.call("/etc/init.d/mwan3 restart >/dev/null")
end
e.remove("/tmp/mwan3")
end
end
end
if nixio.fs.access("/etc/config/dhcp")then
s:tab("dhcpconf",translate("DHCP"),translate("本页是配置/etc/config/DHCP包含机器名等设置文档内容。应用保存后自动重启生效"))
conf=s:taboption("dhcpconf",Value,"dhcpconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/dhcp")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/dhcp",t)
if(luci.sys.call("cmp -s /tmp/dhcp /etc/config/dhcp")==1)then
e.writefile("/etc/config/dhcp",t)
luci.sys.call("/etc/init.d/network restart >/dev/null")
end
e.remove("/tmp/dhcp")
end
end
end
if nixio.fs.access("/etc/config/ddns")then
s:tab("ddnsconf",translate("DDNS"),translate("本页是配置/etc/config/ddns包含动态域名设置文档内容。应用保存后自动重启生效"))
conf=s:taboption("ddnsconf",Value,"ddnsconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/ddns")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/ddns",t)
if(luci.sys.call("cmp -s /tmp/ddns /etc/config/ddns")==1)then
e.writefile("/etc/config/ddns",t)
luci.sys.call("/etc/init.d/ddns restart >/dev/null")
end
e.remove("/tmp/ddns")
end
end
end

if nixio.fs.access("/etc/config/timecontrol")then
s:tab("timecontrolconf",translate("时间控制"),translate("本页是配置/etc/config/timecontrol包含上网时间控制配置文档内容。应用保存后自动重启生效"))
conf=s:taboption("timecontrolconf",Value,"timecontrolconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/timecontrol")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/timecontrol",t)
if(luci.sys.call("cmp -s /tmp/timecontrol /etc/config/timecontrol")==1)then
e.writefile("/etc/config/timecontrol",t)
luci.sys.call("/etc/init.d/timecontrol restart >/dev/null")
end
e.remove("/tmp/timecontrol")
end
end
end
if nixio.fs.access("/etc/config/rebootschedule")then
s:tab("rebootscheduleconf",translate("定时设置"),translate("本页是配置/etc/config/rebootschedule包含定时设置任务配置文档内容。应用保存后自动重启生效"))
conf=s:taboption("rebootscheduleconf",Value,"rebootscheduleconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/rebootschedule")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/rebootschedule",t)
if(luci.sys.call("cmp -s /tmp/rebootschedule /etc/config/rebootschedule")==1)then
e.writefile("/etc/config/rebootschedule",t)
luci.sys.call("/etc/init.d/rebootschedule restart >/dev/null")
end
e.remove("/tmp/rebootschedule")
end
end
end
if nixio.fs.access("/etc/config/wolplus")then
s:tab("wolplusconf",translate("网络唤醒"),translate("本页是配置/etc/config/wolplus包含网络唤醒配置文档内容。应用保存后自动重启生效"))
conf=s:taboption("wolplusconf",Value,"wolplusconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/wolplus")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/wolplus",t)
if(luci.sys.call("cmp -s /tmp/wolplus /etc/config/wolplus")==1)then
e.writefile("/etc/config/wolplus",t)
luci.sys.call("/etc/init.d/wolplus restart >/dev/null")
end
e.remove("/tmp/wolplus")
end
end
end

if nixio.fs.access("/etc/config/smartdns")then
s:tab("smartdnsconf",translate("SMARTDNS"),translate("本页是配置/etc/config/smartdns包含smartdns配置文档内容。应用保存后自动重启生效"))
conf=s:taboption("smartdnsconf",Value,"smartdnsconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/smartdns")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/smartdns",t)
if(luci.sys.call("cmp -s /tmp/smartdns /etc/config/smartdns")==1)then
e.writefile("/etc/config/smartdns",t)
luci.sys.call("/etc/init.d/smartdns restart >/dev/null")
end
e.remove("/tmp/smartdns")
end
end
end
if nixio.fs.access("/etc/config/openclash")then
s:tab("openclashconf",translate("openclash"),translate("本页是配置/etc/config/openclash的文档内容。应用保存后自动重启生效"))
conf=s:taboption("openclashconf",Value,"openclashconf",nil,translate("开头的数字符号（＃）或分号的每一行（;）被视为注释；删除（;）启用指定选项。"))
conf.template="cbi/tvalue"
conf.rows=20
conf.wrap="off"
conf.cfgvalue=function(t,t)
return e.readfile("/etc/config/openclash")or""
end
conf.write=function(a,a,t)
if t then
t=t:gsub("\r\n?","\n")
e.writefile("/tmp/openclash",t)
if(luci.sys.call("cmp -s /tmp/openclash /etc/config/openclash")==1)then
e.writefile("/etc/config/openclash",t)
luci.sys.call("/etc/init.d/openclash restart >/dev/null")
end
e.remove("/tmp/openclash")
end
end
end


return m
