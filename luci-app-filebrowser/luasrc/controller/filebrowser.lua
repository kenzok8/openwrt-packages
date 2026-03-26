module("luci.controller.filebrowser", package.seeall)

local http = require "luci.http"
local fs = require "nixio.fs"
local api = require "luci.model.cbi.filebrowser.api"

function index()
	if not fs.access("/etc/config/filebrowser") then return end
	-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需重复注册
	if fs.access("/usr/share/luci/menu.d/luci-app-filebrowser.json") then return end

	entry({"admin", "services"}, firstchild(), "Services", 44).dependent = false
	entry({"admin", "services", "filebrowser"}, cbi("filebrowser/settings"),
		_("File Browser"), 2).dependent = true

	entry({"admin", "services", "filebrowser", "check"}, call("action_check")).leaf = true
	entry({"admin", "services", "filebrowser", "download"}, call("action_download")).leaf = true
	entry({"admin", "services", "filebrowser", "status"}, call("act_status")).leaf = true
	entry({"admin", "services", "filebrowser", "get_log"}, call("get_log")).leaf = true
	entry({"admin", "services", "filebrowser", "clear_log"}, call("clear_log")).leaf = true
end

local function http_write_json(content)
	http.prepare_content("application/json")
	http.write_json(content or {code = 1})
end

function act_status()
	local result = {}
	local uci = require "luci.model.uci".cursor()
	local exec_dir = uci:get("filebrowser", "@global[0]", "executable_directory") or "/tmp"
	local fb_bin = exec_dir .. "/filebrowser"

	if fs.access(fb_bin) then
		result.status = (luci.sys.call("pgrep -f '" .. fb_bin .. "' >/dev/null 2>&1") == 0)
	else
		result.status = false
	end

	http_write_json(result)
end

function action_check()
	local json = api.to_check()
	http_write_json(json)
end

function action_download()
	local task = http.formvalue("task")
	local json

	if task == "extract" then
		json = api.to_extract(http.formvalue("file"))
	elseif task == "move" then
		json = api.to_move(http.formvalue("file"))
	else
		json = api.to_download(http.formvalue("url"))
	end

	http_write_json(json)
end

function get_log()
	http.prepare_content("text/plain; charset=utf-8")
	local log_path = "/var/log/filebrowser.log"
	if fs.access(log_path) then
		http.write(fs.readfile(log_path) or "")
	else
		http.write("")
	end
end

function clear_log()
	local log_path = "/var/log/filebrowser.log"
	fs.writefile(log_path, "")
	http.prepare_content("application/json")
	http.write_json({code = 0})
end
