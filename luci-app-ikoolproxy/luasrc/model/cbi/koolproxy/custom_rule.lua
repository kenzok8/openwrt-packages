o = Map("koolproxy")

t = o:section(TypedSection, "global")
t.anonymous = true

e = t:option(TextValue, "user_rule")
e.description = translate("输入你的自定义规则，每条规则一行。")
e.rows = 28
e.wrap = "off"

local fs = require "nixio.fs"
local i = "/usr/share/koolproxy/data/user.txt"

function e.cfgvalue()
	return fs.readfile(i) or ""
end

function e.write(self, section, value)
	if value then
		value = value:gsub("\r\n", "\n")
	else
		value = ""
	end
	fs.writefile("/tmp/user.txt", value)
	if (luci.sys.call("cmp -s /tmp/user.txt /usr/share/koolproxy/data/user.txt") == 1) then
		fs.writefile(i, value)
	end
	fs.remove("/tmp/user.txt")
end

return o
