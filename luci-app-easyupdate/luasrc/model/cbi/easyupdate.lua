local pcall, dofile, _G = pcall, dofile, _G
pcall(dofile, "/etc/openwrt_release")
local fs = require "nixio.fs"

m=Map("easyupdate",translate("EasyUpdate"),translate("EasyUpdate LUCI supports scheduled upgrade & one-click firmware upgrade.") .. [[<br />]] .. translate("Update may cause the restart failure, Exercise caution when selecting automatic update.") .. [[<br /><br /><a href="https://github.com/sundaqiang/openwrt-packages" target="_blank">Powered by sundaqiang</a>]])

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
w.default=1
w:depends("enable", "1")

h=s:option(Value,"hour",translate("Hour"),translate("Only 0 to 23 can be entered."))
h.datatype="range(0,23)"
h.rmempty=true
h.default=0
h:depends("enable", "1")

n=s:option(Value,"minute",translate("Minute"),translate("Only 0 to 59 can be entered."))
n.datatype="range(0,59)"
n.rmempty=true
n.default=30
n:depends("enable", "1")

g=s:option(Value,"github",translate("Github Url"),translate("Your Github project address."))
g.default=''
g.rmempty=false

l=s:option(TextValue,"",translate("Log"))
l.rmempty = true
l.rows = 15
function l.cfgvalue()
	return fs.readfile("/tmp/easyupdatemain.log") or ""
end
l.readonly="readonly"

b=s:option(Button,"",translate("Firmware Upgrade"))
b.template="easyupdate/button"
b.versions=_G.DISTRIB_VERSIONS

local apply = luci.http.formvalue("cbi.apply")
if apply then
    local enable = luci.http.formvalue("cbid.easyupdate.main.enable")
    crontabs=fs.readfile("/etc/crontabs/root")
    if enable then
        crontabs=crontabs:gsub('[%d%* ]+/usr/bin/easyupdate%.sh %-u # EasyUpdate\n', '')
        if crontabs:sub(-1) == '\n' then
            n=''
        else
            n='\n' 
        end
        local week = luci.http.formvalue("cbid.easyupdate.main.week")
        if week == '7' then
            week='*'
        end
        local hour = luci.http.formvalue("cbid.easyupdate.main.hour")
        local minute = luci.http.formvalue("cbid.easyupdate.main.minute")
        crontabs=crontabs .. n .. minute .. ' ' .. hour .. ' ' .. '* * ' .. week .. ' /usr/bin/easyupdate.sh -u # EasyUpdate\n'
    else
        crontabs=crontabs:gsub('[%d%* ]+/usr/bin/easyupdate%.sh %-u # EasyUpdate\n', '')
    end
    fs.writefile ("/etc/crontabs/root", crontabs)
end

return m