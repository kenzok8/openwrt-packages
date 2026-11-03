-- SPDX-License-Identifier: Apache-2.0
-- Called locally by postinst, never exposed as a LuCI/RPC operation.
-- rpcd reads ACL files at login. Add this package's newly installed rights to
-- existing authorized sessions without restarting rpcd or touching other ACLs.
local group = "luci-app-lucky"
local fs = require("nixio.fs")
local json = require("luci.jsonc")
local uci = require("uci").cursor()
local bus = assert(require("ubus").connect(), "Cannot connect to ubus")
local acl = assert(json.parse(fs.readfile("/usr/share/rpcd/acl.d/" .. group .. ".json") or ""))
assert(type(acl[group]) == "table", "Missing Lucky ACL")

local function quote(value)
	return "'" .. value:gsub("'", "'\\''") .. "'"
end

local function matches(pattern)
	-- Use shell patterns like rpcd's fnmatch(), including [] and backslashes.
	-- Expansion in a case pattern is not shell code; quoting the assignment
	-- prevents substitutions or commands embedded in a UCI value from running.
	if pattern:find("%z") then return false end
	return os.execute("pattern=" .. quote(pattern) .. "; case " .. quote(group) ..
		" in $pattern) exit 0;; *) exit 1;; esac") == 0
end

local function allowed(login, permission)
	local patterns = login[permission]
	if type(patterns) == "table" then
		-- Denials take precedence, matching rpcd's login permission checks.
		for _, pattern in ipairs(patterns) do
			if type(pattern) == "string" and pattern:sub(1, 1) == "!" then
				local denied = pattern:sub(2):match("^%s*(.*)$")
				if denied ~= "" and matches(denied) then return false end
			end
		end
		for _, pattern in ipairs(patterns) do
			if type(pattern) == "string" and pattern ~= "" and pattern:sub(1, 1) ~= "!" and matches(pattern) then
				return true
			end
		end
	end
	return permission == "read" and allowed(login, "write") or false
end

local logins = {}
uci:foreach("rpcd", "login", function(login)
	local name = login.username
	if type(name) == "string" and logins[name] == nil then
		logins[name] = { read = allowed(login, "read"), write = allowed(login, "write") }
	end
end)

local function grant(sid, scope, objects)
	if #objects == 0 then return end
	local _, err = bus:call("session", "grant", { ubus_rpc_session = sid, scope = scope, objects = objects })
	-- A session may expire or be logged out while installation is finishing.
	-- Never recreate a logged-out or expired session.
	if err and err ~= 0 and err ~= 4 then error("Cannot refresh Lucky ACL") end
end

local sessions = { bus:call("session", "list", {}) }
assert(type(sessions[1]) == "table", "Cannot list sessions")
for _, session in ipairs(sessions) do
	local sid = session.ubus_rpc_session
	local permissions = type(session.data) == "table" and logins[session.data.username]
	if permissions and type(sid) == "string" and #sid == 32 and sid:match("^%x+$") and
		sid ~= string.rep("0", 32) and tonumber(session.expires) and tonumber(session.expires) > 0 then
		for _, permission in ipairs({ "read", "write" }) do
			if permissions[permission] and type(acl[group][permission]) == "table" then
				for scope, entries in pairs(acl[group][permission]) do
					local objects = {}
					for object, functions in pairs(entries) do
						if type(object) == "number" then
							objects[#objects + 1] = { functions, permission }
						else
							for _, func in ipairs(functions) do objects[#objects + 1] = { object, func } end
						end
					end
					grant(sid, scope, objects)
				end
				grant(sid, "access-group", { { group, permission } })
			end
		end
	end
end
bus:close()
