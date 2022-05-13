local datatypes = require "luci.cbi.datatypes"

local white_list_file = "/etc/mosdns/whitelist.txt"
local block_list_file = "/etc/mosdns/rule/blocklist.txt"
local hosts_list_file = "/etc/mosdns/rule/hosts.txt"
local redirect_list_file = "/etc/mosdns/rule/redirect.txt"
local cus_config_file = "/etc/mosdns/cus_config.yaml"

m = Map("mosdns")

s = m:section(TypedSection, "mosdns", translate("Rule Settings"))
s.anonymous = true

s:tab("white_list", translate("White Lists"))
s:tab("block_list", translate("Block Lists"))
s:tab("hosts_list", translate("Hosts"))
s:tab("redirect_list", translate("Redirect"))
s:tab("cus_config", translate("Cus Config"))

o = s:taboption("white_list", TextValue, "whitelist", "", "<font color='red'>" .. translate("These domain names allow DNS resolution with the highest priority. Please input the domain names of websites, every line can input only one website domain. For example: hm.baidu.com.") .. "</font>" .. "<font color='#00bd3e'>" .. translate("<br>The list of rules only apply to 'Default Config' profiles.") .. "</font>")
o.rows = 15
o.wrap = "off"
o.cfgvalue = function(self, section) return nixio.fs.readfile(white_list_file) or "" end
o.write = function(self, section, value) nixio.fs.writefile(white_list_file , value:gsub("\r\n", "\n")) end
o.remove = function(self, section, value) nixio.fs.writefile(white_list_file , "") end
o.validate = function(self, value)
    return value
end

o = s:taboption("block_list", TextValue, "blocklist", "", "<font color='red'>" .. translate("These domains are blocked from DNS resolution. Please input the domain names of websites, every line can input only one website domain. For example: baidu.com.") .. "</font>" .. "<font color='#00bd3e'>" .. translate("<br>The list of rules only apply to 'Default Config' profiles.") .. "</font>")
o.rows = 15
o.wrap = "off"
o.cfgvalue = function(self, section) return nixio.fs.readfile(block_list_file) or "" end
o.write = function(self, section, value) nixio.fs.writefile(block_list_file, value:gsub("\r\n", "\n")) end
o.remove = function(self, section, value) nixio.fs.writefile(block_list_file, "") end
o.validate = function(self, value)
    return value
end

o = s:taboption("hosts_list", TextValue, "hosts", "", "<font color='red'>" .. translate("Hosts For example: baidu.com 10.0.0.1") .. "</font>" .. "<font color='#00bd3e'>" .. translate("<br>The list of rules only apply to 'Default Config' profiles.") .. "</font>")
o.rows = 15
o.wrap = "off"
o.cfgvalue = function(self, section) return nixio.fs.readfile(hosts_list_file) or "" end
o.write = function(self, section, value) nixio.fs.writefile(hosts_list_file, value:gsub("\r\n", "\n")) end
o.remove = function(self, section, value) nixio.fs.writefile(hosts_list_file, "") end
o.validate = function(self, value)
    return value
end

o = s:taboption("redirect_list", TextValue, "redirect", "", "<font color='red'>" .. translate("The domain name to redirect the request to. Requests domain A, but returns records for domain B. example: a.com b.com") .. "</font>" .. "<font color='#00bd3e'>" .. translate("<br>The list of rules only apply to 'Default Config' profiles.") .. "</font>")
o.rows = 15
o.wrap = "off"
o.cfgvalue = function(self, section) return nixio.fs.readfile(redirect_list_file) or "" end
o.write = function(self, section, value) nixio.fs.writefile(redirect_list_file, value:gsub("\r\n", "\n")) end
o.remove = function(self, section, value) nixio.fs.writefile(redirect_list_file, "") end
o.validate = function(self, value)
    return value
end

o = s:taboption("cus_config", TextValue, "Cus Config", "", "<font color='red'>" .. translate("View the Custom YAML Configuration file used by this MosDNS. You can edit it as you own need.") .. "</font>" .. "<font color='#00bd3e'>" .. translate("<br>The list of rules only apply to 'Custom Config' profiles.") .. "</font>")
o.rows = 30
o.wrap = "off"
o.cfgvalue = function(self, section) return nixio.fs.readfile(cus_config_file) or "" end
o.write = function(self, section, value) nixio.fs.writefile(cus_config_file, value:gsub("\r\n", "\n")) end
o.remove = function(self, section, value) nixio.fs.writefile(cus_config_file, "") end
o.validate = function(self, value)
    return value
end

local apply = luci.http.formvalue("cbi.apply")
if apply then
    luci.sys.exec("/etc/init.d/mosdns reload")
end

return m
