local pcall, dofile, _G = pcall, dofile, _G
pcall(dofile, "/etc/openwrt_release")

m=Map("easyupdate",translate("EasyUpdate"),translate("EasyUpdate LUCI supports scheduled upgrade & one-click firmware upgrade") .. [[<br /><br /><a href="https://github.com/sundaqiang/openwrt-packages" target="_blank">Powered by sundaqiang</a>]])

s=m:section(TypedSection,"easyupdate")
s.anonymous=true

e=s:option(Flag, "enable", translate("Enable"),translate("When selected, firmware upgrade will be automatically at the specified time."))
e.default=0
e.optional=false

p=s:option(Flag, "proxy", translate("Use China Mirror"),translate("When selected, will use the China mirror when accessing Github."))
p.default=1
p.optional=false

k= s:option(Flag, "keepconfig", translate("KEEP CONFIG"),translate("When selected, configuration is retained when firmware upgrade."))
k.default=1
k.optional=false

f=s:option(Flag, "forceflash", translate("Preference Force Flashing"),translate("When selected, Preference Force Flashing while firmware upgrading."))
f.default=0
f.optional=false

w=s:option(ListValue,"week",translate("Update Time"),translate("Advised to set the automatic update time to idle time."))
w:value(7,translate("Everyday"))
w:value(1,translate("Monday"))
w:value(2,translate("Tuesday"))
w:value(3,translate("Wednesday"))
w:value(4,translate("Thursday"))
w:value(5,translate("Friday"))
w:value(6,translate("Saturday"))
w:value(0,translate("Sunday"))
w.default=0
w:depends("enable", "1")

h=s:option(Value,"hour",translate("Hour"))
h.datatype="range(0,23)"
h.rmempty=true
h.default=0
h:depends("enable", "1")

n=s:option(Value,"minute",translate("Minute"))
n.datatype="range(0,59)"
n.rmempty=true
n.default=30
n:depends("enable", "1")

g=s:option(Value,"github",translate("Github Url"),translate("Your Github project address "))
g.default=''
g.rmempty=false

b=s:option(Button,"",translate("Firmware Upgrade"))
b.template="easyupdate/button"
b.versions=_G.DISTRIB_VERSIONS

return m