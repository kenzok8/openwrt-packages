local fs = require "nixio.fs"
local sys = require "luci.sys"
local uci = require "luci.model.uci".cursor()
local util = require "luci.util"
local i18n = require "luci.i18n"

module("luci.model.cbi.filebrowser.api", package.seeall)

local appname = "filebrowser"
local api_url = "https://api.github.com/repos/filebrowser/filebrowser/releases/latest"

local function get_downloader()
	if fs.access("/usr/bin/curl") or fs.access("/bin/curl") then
		return "/usr/bin/curl", {
			"-L", "-k", "--retry", "2", "--connect-timeout", "10", "-o"
		}
	end
	if fs.access("/usr/bin/wget") then
		return "/usr/bin/wget", {
			"--no-check-certificate", "--quiet", "--timeout=10", "--tries=2", "-O"
		}
	end
	return nil, {}
end

local command_timeout = 300

local lede_board = nil
local distrib_target = nil

local function uci_get_type(t, config, default)
	local value
	value = uci:get_first(appname, t, config)
	if not value or value == "" then
		value = sys.exec("uci -q get " .. appname .. ".@" .. t .. "[0]." .. config)
	end
	if (value == nil or value == "") and default and default ~= "" then
		value = default
	end
	return value
end

local function exec(cmd, args, writer, timeout)
	local os = require "os"
	local nixio = require "nixio"

	local fdi, fdo = nixio.pipe()
	local pid = nixio.fork()

	if pid > 0 then
		fdo:close()

		if writer or timeout then
			local starttime = os.time()
			while true do
				if timeout and os.difftime(os.time(), starttime) >= timeout then
					nixio.kill(pid, nixio.const.SIGTERM)
					return 1
				end

				if writer then
					local buffer = fdi:read(2048)
					if buffer and #buffer > 0 then
						writer(buffer)
					end
				end

				local wpid, stat, code = nixio.waitpid(pid, "nohang")

				if wpid and stat == "exited" then return code end

				if not writer and timeout then nixio.nanosleep(1) end
			end
		else
			local wpid, stat, code = nixio.waitpid(pid)
			return wpid and stat == "exited" and code
		end
	elseif pid == 0 then
		nixio.dup(fdo, nixio.stdout)
		fdi:close()
		fdo:close()
		nixio.exece(cmd, args, nil)
		nixio.stdout:close()
		os.exit(1)
	end
end

local function compare_versions(ver1, comp, ver2)
	local av1 = util.split(ver1, "[%.%-]", nil, true)
	local av2 = util.split(ver2, "[%.%-]", nil, true)

	local max = #av1
	local n2 = #av2
	if max < n2 then max = n2 end

	for i = 1, max do
		local s1 = av1[i] or ""
		local s2 = av2[i] or ""

		if comp == "~=" and (s1 ~= s2) then return true end
		if (comp == "<" or comp == "<=") and (s1 < s2) then return true end
		if (comp == ">" or comp == ">=") and (s1 > s2) then return true end
		if (s1 ~= s2) then return false end
	end

	return not (comp == "<" or comp == ">")
end

local function auto_get_arch()
	local nixio = require "nixio"
	local arch = nixio.uname().machine or ""

	if fs.access("/etc/openwrt_release") then
		local target = sys.exec("grep 'DISTRIB_TARGET=' /etc/openwrt_release 2>/dev/null | cut -d\"'\" -f2 | head -1")
		distrib_target = target
	end

	if fs.access("/usr/lib/os-release") then
		local board = sys.exec("grep 'OPENWRT_BOARD=' /usr/lib/os-release 2>/dev/null | cut -d\"'\" -f2 | head -1")
		if board and board ~= "" then
			lede_board = board
		end
	end

	if arch == "mips" then
		local target_str = distrib_target or lede_board or ""
		if target_str:match("ramips") then
			arch = "ramips"
		elseif target_str:match("ar71xx") then
			arch = "ar71xx"
		end
	end

	return util.trim(arch)
end

local function get_file_info(arch)
	local file_tree = ""
	local sub_version = ""

	if arch == "x86_64" then
		file_tree = "amd64"
	elseif arch == "aarch64" then
		file_tree = "arm64"
	elseif arch == "ramips" then
		file_tree = "mipsle"
	elseif arch == "ar71xx" then
		file_tree = "mips"
	elseif arch:match("^i[%d]86$") then
		file_tree = "386"
	elseif arch:match("^armv[5-8]") then
		file_tree = "armv"
		sub_version = arch:match("armv([5-8])")
		local target_str = lede_board or distrib_target or ""
		if target_str:match("bcm53xx") then
			sub_version = "5"
		end
	end

	return file_tree, sub_version
end

local function get_api_json(url)
	local jsonc = require "luci.jsonc"

	local downloader, args = get_downloader()
	if not downloader then
		return {}
	end

	local tmpfile = "/tmp/filebrowser_api_json"
	if downloader:match("curl") then
		local ret = sys.call(downloader .. " -L -k --connect-timeout 10 -s -o " .. tmpfile .. " " .. url)
		if ret ~= 0 then
			return {}
		end
	else
		local ret = sys.call(downloader .. " --no-check-certificate --timeout=10 -t 2 -O " .. tmpfile .. " " .. url)
		if ret ~= 0 then
			return {}
		end
	end

	local content = fs.readfile(tmpfile) or ""
	fs.remove(tmpfile)

	if content == "" then return {} end

	local json, err = jsonc.parse(content)
	return json or {}
end

function get_version()
	return uci_get_type("global", "version", "0")
end

function to_check(arch)
	if not arch or arch == "" then
		arch = auto_get_arch()
	end

	local file_tree, sub_version = get_file_info(arch)

	if file_tree == "" then
		return {
			code = 1,
			error = i18n.translate("Can't determine ARCH, or ARCH not supported.")
		}
	end

	local json = get_api_json(api_url)

	if not json or json.tag_name == nil then
		return {
			code = 1,
			error = i18n.translate("Get remote version info failed.")
		}
	end

	local remote_version = json.tag_name:match("[^v]+")
	local needs_update = compare_versions(get_version(), "<", remote_version)
	local html_url, download_url

	if needs_update then
		html_url = json.html_url
		for _, v in ipairs(json.assets or {}) do
			if v.name then
				local pattern = "linux%-" .. file_tree
				if sub_version and sub_version ~= "" then
					pattern = pattern .. sub_version .. "$"
				end
				if v.name:match(pattern) then
					download_url = v.browser_download_url
					break
				end
			end
		end
	end

	if needs_update and not download_url then
		return {
			code = 1,
			version = remote_version,
			html_url = html_url,
			error = i18n.translate("New version found, but failed to get new version download url.")
		}
	end

	return {
		code = 0,
		update = needs_update,
		version = remote_version,
		url = {html = html_url, download = download_url}
	}
end

function to_download(url)
	if not url or url == "" then
		return {code = 1, error = i18n.translate("Download url is required.")}
	end

	sys.call("rm -f /tmp/filebrowser_download.*")

	local tmp_file = sys.exec("mktemp -u -t filebrowser_download.XXXXXX 2>/dev/null")
	if not tmp_file or tmp_file == "" then
		return {code = 1, error = i18n.translate("Failed to create temp file.")}
	end
	tmp_file = util.trim(tmp_file)

	local downloader, args = get_downloader()
	if not downloader then
		return {code = 1, error = i18n.translate("No downloader available (curl or wget).")}
	end

	local outfile = "/tmp/filebrowser_download.bin"
	local cmd
	if downloader:match("curl") then
		cmd = downloader .. " -L -k --connect-timeout 10 -o " .. outfile .. " " .. url .. " 2>/dev/null"
	else
		cmd = downloader .. " --no-check-certificate --timeout=10 -t 2 -O " .. outfile .. " " .. url .. " 2>/dev/null"
	end

	local ret = sys.call(cmd)
	if ret ~= 0 or not fs.access(outfile) then
		sys.call("rm -f " .. outfile)
		return {
			code = 1,
			error = i18n.translatef("File download failed or timed out: %s", url)
		}
	end

	return {code = 0, file = outfile}
end

function to_extract(file)
	if not file or file == "" or not fs.access(file) then
		return {code = 1, error = i18n.translate("File path required.")}
	end

	sys.call("rm -rf /tmp/filebrowser_extract.*")

	local tmp_dir = sys.exec("mktemp -d -t filebrowser_extract.XXXXXX 2>/dev/null")
	if not tmp_dir or tmp_dir == "" then
		return {code = 1, error = i18n.translate("Failed to create temp directory.")}
	end
	tmp_dir = util.trim(tmp_dir)

	local output = {}
	exec("/bin/tar", {"-C", tmp_dir, "-zxvf", file},
		function(chunk)
			if chunk then
				output[#output + 1] = chunk
			end
		end)

	local files = util.split(table.concat(output))

	exec("/bin/rm", {"-f", file})

	local new_file
	for _, f in pairs(files) do
		if f and f:match("filebrowser") then
			local candidate = tmp_dir .. "/" .. util.trim(f)
			if fs.access(candidate) then
				new_file = candidate
				break
			end
		end
	end

	if not new_file then
		exec("/bin/rm", {"-rf", tmp_dir})
		return {
			code = 1,
			error = i18n.translatef("Can't find client in file: %s", file)
		}
	end

	return {code = 0, file = new_file}
end

function to_move(file)
	if not file or file == "" or not fs.access(file) then
		sys.call("rm -rf /tmp/filebrowser_extract.*")
		return {code = 1, error = i18n.translate("Client file is required.")}
	end

	local executable_directory = uci_get_type("global", "executable_directory", "/tmp")

	if not fs.access(executable_directory) then
		fs.mkdir(executable_directory)
	end

	local client_path = executable_directory .. "/filebrowser"
	local client_path_bak

	if fs.access(client_path) then
		client_path_bak = "/tmp/filebrowser.bak"
		exec("/bin/mv", {"-f", client_path, client_path_bak})
	end

	local result = exec("/bin/mv", {"-f", file, client_path}, nil, command_timeout) == 0

	if not result or not fs.access(client_path) then
		if client_path_bak and fs.access(client_path_bak) then
			exec("/bin/mv", {"-f", client_path_bak, client_path})
		end
		return {
			code = 1,
			error = i18n.translatef("Can't move new file to path: %s", client_path)
		}
	end

	exec("/bin/chmod", {"755", client_path})

	if client_path_bak then
		exec("/bin/rm", {"-f", client_path_bak})
	end

	sys.call("rm -rf /tmp/filebrowser_extract.*")

	return {code = 0}
end
