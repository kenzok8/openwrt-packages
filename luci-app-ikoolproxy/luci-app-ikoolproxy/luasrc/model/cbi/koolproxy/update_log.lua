o = Map("koolproxy")

t = o:section(TypedSection, "global")
t.anonymous = true

local fs = require "nixio.fs"
local i = "/var/log/koolproxy.log"

e = t:option(TextValue, "kpupdate_log")
e.description = translate("查看最近的更新日志")
e.rows = 28
e.wrap = "off"

function e.cfgvalue()
	return fs.readfile(i) or ""
end

function e.write(self, section, value)
end

return o
