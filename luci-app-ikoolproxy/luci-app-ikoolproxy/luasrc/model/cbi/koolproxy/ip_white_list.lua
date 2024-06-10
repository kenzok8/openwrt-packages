o = Map("koolproxy")

t = o:section(TypedSection, "global")
t.anonymous = true

e = t:option(TextValue, "adbypass_ip")
e.description = translate("这些已加入的ip地址将使用代理，但只有GFW型号。请输入ip地址或ip地址段，每行只能输入一个ip地址。例如，112.123.134.145 / 24或112.123.134.145。")
e.rows = 28
e.wrap = "off"

local fs = require "nixio.fs"
local i = "/etc/adblocklist/adbypassip"

function e.cfgvalue()
	return fs.readfile(i) or ""
end

function e.write(self, section, value)
	if value then
		value = value:gsub("\r\n", "\n")
	else
		value = ""
	end
	fs.writefile("/tmp/adbypassip", value)
	if (luci.sys.call("cmp -s /tmp/adbypassip /etc/adblocklist/adbypassip") == 1) then
		fs.writefile(i, value)
	end
	fs.remove("/tmp/adbypassip")
end

return o
