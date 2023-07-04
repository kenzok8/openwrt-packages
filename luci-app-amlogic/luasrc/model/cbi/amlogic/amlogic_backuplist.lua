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

-- Add ' \' to the end of each line except the last line
function check_backslash(str)
	local lines = {}
	for line in str:gmatch("[^\r\n]+") do
		table.insert(lines, line)
	end

	local lastLineIndex = #lines
	for i, line in ipairs(lines) do
		if i < lastLineIndex then
			if not line:match("%s+\\%s*$") then
				lines[i] = line .. " \\"
			end
		end
	end

	return table.concat(lines, "\n")
end

local f = SimpleForm("customize",
	translate("Backup Configuration - Custom List"),
	translate("Please maintain the format of the backup list. Except for the last line, each line should end with ' \\' character."))

local o = f:field(Value, "_custom")

o.template = "cbi/tvalue"
o.rows = 30

function o.cfgvalue(self, section)
	local readconf = fs.readfile(backup_list_conf)
	local value = remove_spaces(readconf)
	local value = check_backslash(value)
	return value
end

function o.write(self, section, value)
	local value = remove_spaces(value)
	local value = check_backslash(value)
	fs.writefile(backup_list_conf, value)
	luci.http.redirect(luci.dispatcher.build_url("admin", "system", "amlogic", "backup"))
end

return f
