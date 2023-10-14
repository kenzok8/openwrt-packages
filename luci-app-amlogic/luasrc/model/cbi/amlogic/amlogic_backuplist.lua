local fs = require "nixio.fs"
local backup_list_conf = "/etc/amlogic_backup_list.conf"

-- Delete all spaces and tabs at the beginning of the line, and the unified line break is \n
function remove_spaces(value)
	local lines = {}
	for line in value:gmatch("[^\r\n]+") do
		line = line:gsub("^%s*", "")
		if line ~= "" then
			table.insert(lines, line)
		end
	end
	value = table.concat(lines, "\n")
	value = value:gsub("[\r\n]+", "\n")
	return value
end

-- Remove backslash at the end of each line
function remove_backslash_at_end(value)
	local lines = {}
	for line in value:gmatch("[^\r\n]+") do
		line = line:gsub("%s*\\%s*$", "")
		table.insert(lines, line)
	end
	return table.concat(lines, "\n")
end

local f = SimpleForm("customize",
	translate("Backup Configuration - Custom List"),
	translate("Write one configuration item per line, and directories should end with a /."))

local o = f:field(Value, "_custom")

o.template = "cbi/tvalue"
o.rows = 30

function o.cfgvalue(self, section)
	local readconf = fs.readfile(backup_list_conf)
	local value = remove_spaces(readconf)
	local value = remove_backslash_at_end(value)
	return value
end

function o.write(self, section, value)
	local value = remove_spaces(value)
	local value = remove_backslash_at_end(value)
	fs.writefile(backup_list_conf, value)
	luci.http.redirect(luci.dispatcher.build_url("admin", "system", "amlogic", "backup"))
end

return f
