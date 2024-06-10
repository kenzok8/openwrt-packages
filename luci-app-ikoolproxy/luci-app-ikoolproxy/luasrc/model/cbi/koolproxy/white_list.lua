o = Map("koolproxy")

t = o:section(TypedSection, "global")
t.anonymous = true

e = t:option(TextValue, "adbypass_domain")
e.description = translate("这些已经加入的网站将不会使用过滤器。请输入网站的域名，每行只能输入一个网站域名。例如google.com。")
e.rows = 28
e.wrap = "off"

local fs = require "nixio.fs"
local i = "/etc/adblocklist/adbypass"

function e.cfgvalue()
	return fs.readfile(i) or ""
end

function e.write(self, section, value)
	if value then
		value = value:gsub("\r\n", "\n")
	else
		value = ""
	end
	fs.writefile("/tmp/adbypass", value)
	if (luci.sys.call("cmp -s /tmp/adbypass /etc/adblocklist/adbypass") == 1) then
		fs.writefile(i, value)
	end
	fs.remove("/tmp/adbypass")
end

return o
