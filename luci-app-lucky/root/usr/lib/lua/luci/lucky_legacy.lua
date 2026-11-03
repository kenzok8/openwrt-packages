-- SPDX-License-Identifier: Apache-2.0
-- The Lua-only LuCI transport. Modern LuCI never registers this endpoint.
local M = {}
local fs, n = require "nixio.fs", require "nixio"
require "nixio.util"
local http, json = require "luci.http", require "luci.jsonc"
local dispatcher = require "luci.dispatcher"
local ROOT = "/tmp/lucky-luci-backup"
local HELPER = "/usr/libexec/lucky-backup"
local function must(value, message)
	if not value then error(message, 0) end
	return value
end
local function reply(value)
	http.prepare_content("application/json")
	http.write(json.stringify(value))
end
local function token_valid(token)
	return type(token) == "string" and #token == 32 and token:match("^[a-f0-9]+$")
end
local function workspace(token, fresh)
	must(token_valid(token), "Invalid workspace ID")
	local path = ROOT .. "/" .. token
	for _, dir in ipairs({ ROOT, path }) do
		local st = fs.lstat(dir)
		must(st and st.type == "dir" and st.uid == 0, "Workspace has expired")
	end
	if not fresh then
		must(fs.readfile(path .. "/legacy-session") == dispatcher.context.authsession,
			"Workspace belongs to another session; reload or upload again")
	end
	return path
end

local rpc_operations = {
	["/usr/libexec/lucky-call"] = { info = 1, base = 1, status = 1, arch = 1,
		service = 2, ["set-port"] = 2, ["set-safe-url"] = 2,
		["set-internet"] = 2, ["reset-auth"] = 1 },
	[HELPER] = { ["core-status"] = 1, ["core-info"] = 1, ["core-base"] = 1, ["base-invalidate"] = 1,
		["set-port"] = 2, ["set-safe-url"] = 2, ["set-internet"] = 2, ["reset-auth"] = 1 },
	["/usr/libexec/lucky-watchdog"] = { status = 1, enable = 1, disable = 1 },
	["/usr/libexec/lucky-diagnostics"] = { read = 1 }
}
local archive_operations = {
	prepare = false, ["core-prepare"] = false, ["core-fix"] = false, configure = false,
	["rules-localips"] = false, ["rules-allowlist"] = false,
	backup = true, check = true, restore = true, cleanup = true,
	["clear-check"] = true, clear = true, ["core-check"] = true,
	["core-install"] = true, ["rules-save"] = true
}

function M.rpc(data)
	local allowed = rpc_operations[data.command]
	local args = data.args
	must(allowed and type(args) == "table" and allowed[args[1]] == #args, "Unsupported Lucky command")
	for _, value in ipairs(args) do
		must(type(value) == "string" and #value <= 512 and not value:find("[%z\1-\31\127]"), "Invalid command argument")
	end
	if args[1] == "service" then
		must(args[2] == "start" or args[2] == "stop" or args[2] == "restart", "Invalid service action")
	end
	-- Do not inherit Lua LuCI's cached ubus socket across a package/rpcd reload.
	local connection = must(require("ubus").connect(), "Cannot connect to rpcd")
	-- This local call is authorized by the root-only, CSRF-checked endpoint and
	-- command whitelist above. Old LuCI sessions may lack newly installed ACLs.
	local result, code = connection:call("file", "exec", {
		command = data.command, params = args
	})
	connection:close()
	return must(result, "Lucky command failed or timed out (ubus " .. tostring(code) .. ")")
end

function M.archive(data)
	local needs_token = archive_operations[data.operation]
	must(needs_token ~= nil, "Unsupported maintenance operation")
	if needs_token then workspace(data.workspace) else must(data.workspace == nil, "Unexpected workspace ID") end
	local argument = data.workspace
	if data.operation == "configure" then
		must(type(data.argument) == "string" and #data.argument <= 4096 and
			data.argument:match("^[%w%%%.!~*'()_%-]+$"), "Invalid configuration payload")
		argument = data.argument
	else
		must(data.argument == nil, "Unexpected maintenance argument")
	end
	must(fs.access(HELPER, "x"), "Lucky maintenance helper is not installed")
	local input, output = n.pipe()
	must(input and output, "Cannot create maintenance pipe")
	local pid = n.fork()
	if not pid then input:close(); output:close(); error("Cannot start maintenance", 0) end
	if pid == 0 then
		-- Keep recovery in the helper independent of the HTTP worker's lifetime.
		n.setsid()
		input:close()
		local null = n.open("/dev/null", "r+")
		n.dup(null, n.stdin); n.dup(null, n.stderr); n.dup(output, n.stdout)
		output:close(); null:close()
		if argument then n.exec(HELPER, data.operation, argument)
		else n.exec(HELPER, data.operation) end
		os.exit(127)
	end
	output:close()
	-- Preparation replies are small and need a session owner before disclosure.
	-- Stream file-list replies so a large restore preview isn't duplicated in RAM.
	local chunks, total = {}, 0
	local function consume(write)
		while true do
			local block = input:read(8192)
			if not block or #block == 0 then break end
			total = total + #block
			write(block)
		end
		input:close(); n.waitpid(pid)
	end
	if needs_token or data.operation == "configure" then
		-- LuCI's HTTP writer yields; Lua 5.1 cannot yield through pcall().
		-- Dispatch executes this response writer after protected validation.
		return function()
			http.prepare_content("application/json")
			consume(http.write)
			if total == 0 then reply({ ok = false, error = "Maintenance helper returned no result" }) end
		end
	end
	consume(function(block)
		if total > 524288 then input:close(); n.waitpid(pid); error("Maintenance response exceeds limit", 0) end
		chunks[#chunks + 1] = block
	end)
	local result = must(json.parse(table.concat(chunks)), "Invalid maintenance response")
	if result.ok and result.token then
		local path = workspace(result.token, true) .. "/legacy-session"
		must(fs.writefile(path, dispatcher.context.authsession), "Cannot bind workspace to session")
		fs.chmod(path, "600")
	end
	return result
end

function M.config(data)
	local uci = require("luci.model.uci").cursor()
	local section
	uci:foreach("lucky", "lucky", function(s) section = section or s[".name"] end)
	must(section, "Lucky configuration section is missing")
	if data.operation ~= "get" then
		must(data.operation == "save" or data.operation == "apply", "Unsupported configuration operation")
		local value = data.value
		must(type(value) == "string" and #value > 1 and #value <= 512 and value:sub(1, 1) == "/"
			and value:sub(1, 2) ~= "//" and not value:find("[%z\1-\31\127]"), "Unsafe configuration directory")
		for part in value:gmatch("[^/]+") do must(part ~= "." and part ~= "..", "Unsafe configuration directory") end
		for _, prefix in ipairs({ "/proc", "/sys", "/dev", "/run" }) do
			must(value ~= prefix and value:sub(1, #prefix + 1) ~= prefix .. "/", "Unsafe configuration directory")
		end
		must(uci:set("lucky", section, "configdir", value) and uci:save("lucky"), "Cannot save configuration")
		require("luci.lucky_core").invalidate_base()
		if data.operation == "apply" then
			must(uci:commit("lucky"), "Cannot commit configuration")
			must(uci:apply({ "lucky" }) == 0, "Configuration saved, but service reload failed")
		end
	end
	return { configdir = uci:get("lucky", section, "configdir") or "/etc/config/lucky.daji" }
end

local upload_limits = { ["core.tar.gz"] = 64 * 1024 * 1024,
	["upload.zip"] = 64 * 1024 * 1024, ["rules.json"] = 524288 }
function M.upload(data, first, length)
	local work = workspace(data.workspace)
	local name = data.name
	local limit = must(upload_limits[name], "Unsupported upload filename")
	must(length and length > 0 and length <= limit and length % 1 == 0, "Invalid upload size")
	local free = must(fs.statvfs(work), "Cannot check temporary space")
	must(free.bavail * free.frsize >= length + 1048576, "Not enough temporary space for upload")
	local path, pending = work .. "/" .. name, work .. "/upload.part"
	local handle = must(n.open(pending, n.open_flags("wronly", "creat", "excl"), "600"), "Another upload is pending; reload and retry")
	local ok, err = pcall(function()
		local received = 0
		local function write(block)
			received = received + #block
			must(received <= length, "Upload exceeds declared size")
			must(handle:writeall(block), "Cannot write uploaded file")
		end
		write(first)
		while true do
			local block, why = http.source()()
			must(not why, "Upload interrupted")
			if not block then break end
			write(block)
		end
		must(received == length, "Incomplete upload")
	end)
	handle:close()
	if not ok then fs.unlink(pending); error(err, 0) end
	if not fs.rename(pending, path) then fs.unlink(pending); error("Cannot finish upload", 0) end
	return { ok = true, size = length }
end

function M.download(data)
	local path = workspace(data.workspace) .. "/backup.zip"
	local st = fs.lstat(path)
	must(st and st.type == "reg" and st.nlink == 1 and st.size <= 64 * 1024 * 1024, "Backup is not available")
	local file = must(io.open(path, "rb"), "Cannot read backup")
	return function()
		http.prepare_content("application/zip")
		http.header("Content-Length", tostring(st.size))
		while true do
			local block = file:read(65536)
			if not block then break end
			http.write(block)
		end
		file:close()
	end
end

function M.dispatch(operation)
	http.header("Cache-Control", "no-store")
	http.header("X-Content-Type-Options", "nosniff")
	if http.getenv("REQUEST_METHOD") ~= "POST" then http.status(405, "Method Not Allowed"); return end
	local ctx = dispatcher.context
	if ctx.authuser ~= "root" or type(ctx.authtoken) ~= "string" or ctx.authtoken == "" then
		http.status(403, "Forbidden"); reply({ error = "Session expired or invalid request token" }); return
	end
	local forbidden = false
	local ok, result = pcall(function()
		local length = tonumber(http.getenv("CONTENT_LENGTH"))
		local data, first
		if operation == "upload" then
			-- Old uhttpd versions discard custom headers. A bounded JSON preamble
			-- carries the CSRF token without putting it in URLs or buffering a file.
			must(length and length > 0 and length <= 64 * 1024 * 1024 + 1024, "Invalid upload size")
			local prefix, ending = "", nil
			repeat
				local block = must(http.source()(), "Incomplete upload header")
				prefix = prefix .. block
				ending = prefix:find("\n", 1, true)
				must((ending or #prefix) <= 1024, "Upload header exceeds limit")
			until ending
			data = json.parse(prefix:sub(1, ending - 1))
			first, length = prefix:sub(ending + 1), length - ending
		else
			must(operation == "rpc" or operation == "archive" or operation == "config" or operation == "download", "Unknown Lucky API")
			must(length and length > 0 and length <= 8192, "Invalid request size")
			data = json.parse(http.content() or "")
		end
		must(type(data) == "table", "Invalid JSON request")
		if data.csrf ~= ctx.authtoken then
			forbidden = true; return { error = "Session expired or invalid request token" }
		end
		if operation == "upload" then return M.upload(data, first, length) end
		return M[operation](data)
	end)
	if not ok then http.status(400, "Bad Request"); reply({ error = tostring(result) })
	elseif forbidden then http.status(403, "Forbidden"); reply(result)
	elseif type(result) == "function" then result()
	elseif result ~= nil then reply(result) end
end

function M.bootstrap(view)
	local i18n = require "luci.i18n"
	i18n.loadc("lucky")
	local resource = require("luci.config").main.resourcebase or "/luci-static/resources"
	local strings = {}
	for _, file in ipairs({ "/www" .. resource .. "/view/" .. view .. ".js",
		"/www" .. resource .. "/view/lucky/legacy.js" }) do
		for text in (fs.readfile(file) or ""):gmatch("_%('([^']*)'%)") do strings[text] = i18n.translate(text) end
	end
	local settings = { view = view, resource = resource, strings = strings,
		token = dispatcher.context.authtoken, api = dispatcher.build_url("admin", "services", "lucky", "legacy") }
	-- JSON is embedded as inert script text; never allow a translated closing tag.
	return json.stringify(settings):gsub("<", "\\u003c"):gsub(">", "\\u003e"):gsub("&", "\\u0026")
end

return M
