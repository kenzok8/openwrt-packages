o = Map("koolproxy")

t = o:section(TypedSection, "global")
t.anonymous = true

e = t:option(TextValue, "adblock_domain")
e.description = translate("加入的网址将走广告过滤端口。只针对黑名单模式。只能输入WEB地址，如：google.com，每个地址一行。")
e.rows = 28
e.wrap = "off"

local fs = require "nixio.fs"
local i = "/etc/adblocklist/adblock"

function e.cfgvalue()
	return fs.readfile(i) or ""
end

function e.write(self, section, value)
	if value then
		value = value:gsub("\r\n", "\n")
	else
		value = ""
	end
	fs.writefile("/tmp/adblock", value)
	if (luci.sys.call("cmp -s /tmp/adblock /etc/adblocklist/adblock") == 1) then
		fs.writefile(i, value)
	end
	fs.remove("/tmp/adblock")
end

return o
