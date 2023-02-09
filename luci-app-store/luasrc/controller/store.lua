module("luci.controller.store", package.seeall)

local myopkg = "is-opkg"
local is_backup = "/usr/libexec/istore/backup"
local page_index = {"admin", "store", "pages"}

function index()
    local function store_api(action, onlypost)
        local e = entry({"admin", "store", action}, onlypost and post("store_action", {action = action}) or call("store_action", {action = action}))
        e.dependent = false -- 父节点不是必须的
        e.leaf = true -- 没有子节点
    end

    local action

    entry({"admin", "store"}, call("redirect_index"), _("iStore"), 31)
    entry({"admin", "store", "pages"}, call("store_index")).leaf = true
    if nixio.fs.access("/usr/lib/lua/luci/view/store/main_dev.htm") then
        entry({"admin", "store", "dev"}, call("store_dev")).leaf = true
    end
    entry({"admin", "store", "token"}, call("store_token"))
    entry({"admin", "store", "log"}, call("store_log"))
    entry({"admin", "store", "uid"}, call("action_user_id"))
    entry({"admin", "store", "upload"}, post("store_upload"))
    entry({"admin", "store", "check_self_upgrade"}, call("check_self_upgrade"))
    entry({"admin", "store", "do_self_upgrade"}, post("do_self_upgrade"))

    for _, action in ipairs({"update", "install", "upgrade", "remove"}) do
        store_api(action, true)
    end
    for _, action in ipairs({"status", "installed"}) do
        store_api(action, false)
    end
    if nixio.fs.access("/usr/libexec/istore/backup") then
        entry({"admin", "store", "get_support_backup_features"}, call("get_support_backup_features"))
        entry({"admin", "store", "light_backup"}, post("light_backup"))
        entry({"admin", "store", "get_light_backup_file"}, call("get_light_backup_file"))
        entry({"admin", "store", "local_backup"}, post("local_backup"))
        entry({"admin", "store", "light_restore"}, post("light_restore"))
        entry({"admin", "store", "local_restore"}, post("local_restore"))
        entry({"admin", "store", "get_backup_app_list_file_path"}, call("get_backup_app_list_file_path"))
        entry({"admin", "store", "get_backup_app_list"}, call("get_backup_app_list"))
        entry({"admin", "store", "get_available_backup_file_list"}, call("get_available_backup_file_list"))
        entry({"admin", "store", "set_local_backup_dir_path"}, post("set_local_backup_dir_path"))
        entry({"admin", "store", "get_local_backup_dir_path"}, call("get_local_backup_dir_path"))
        entry({"admin", "store", "get_block_devices"}, call("get_block_devices"))
    end
end

local function user_id()
    local jsonc = require "luci.jsonc"
    local json_parse = jsonc.parse
    local fs   = require "nixio.fs"
	local data = fs.readfile("/etc/.app_store.id")

    local id
    if data ~= nil then
        id = json_parse(data)
    end
    if id == nil then
        fs.unlink("/etc/.app_store.id")
        id = {arch="",uid=""}
    end

    id.version = (fs.readfile("/etc/.app_store.version") or "?"):gsub("[\r\n]", "")

    return id
end

local function vue_lang()
    local i18n = require("luci.i18n")
    local lang = i18n.translate("istore_vue_lang")
    if lang == "istore_vue_lang" or lang == "" then
        lang = "en"
    end
    return lang
end

local function is_exec(cmd, async)
    local nixio = require "nixio"
    local os   = require "os"
    local fs   = require "nixio.fs"
    local rshift  = nixio.bit.rshift

    local oflags = nixio.open_flags("wronly", "creat")
    local lock, code, msg = nixio.open("/var/lock/istore.lock", oflags)
    if not lock then
        return 255, "", "Open lock failed: " .. msg
    end

    -- Acquire lock
    local stat, code, msg = lock:lock("tlock")
    if not stat then
        lock:close()
        return 255, "", "Lock failed: " .. msg
    end

    if async then
        cmd = "/etc/init.d/tasks task_add istore " .. luci.util.shellquote(cmd)
    end
    local r = os.execute(cmd .. " >/var/log/istore.stdout 2>/var/log/istore.stderr")
    local e = fs.readfile("/var/log/istore.stderr")
    local o = fs.readfile("/var/log/istore.stdout")

    fs.unlink("/var/log/istore.stderr")
    fs.unlink("/var/log/istore.stdout")

    lock:lock("ulock")
    lock:close()

    e = e or ""
    if r == 256 and e == "" then
        e = "os.execute exit code 1"
    end
    return rshift(r,8), o or "", e or ""
end

function redirect_index()
    luci.http.redirect(luci.dispatcher.build_url(unpack(page_index)))
end

function store_index()
    local fs   = require "nixio.fs"
    local features = { "_lua_force_array_" }
    if fs.access("/usr/libexec/istore/backup") then
        features[#features+1] = "backup"
    end
    if luci.sys.call("which docker >/dev/null 2>&1") == 0 then
        features[#features+1] = "docker"
    end
    if luci.sys.call("[ -d /ext_overlay ] >/dev/null 2>&1") == 0 then
        features[#features+1] = "sandbox"
    end
    luci.template.render("store/main", {prefix=luci.dispatcher.build_url(unpack(page_index)),id=user_id(),lang=vue_lang(),features=features})
end

function store_dev()
    luci.template.render("store/main_dev", {prefix=luci.dispatcher.build_url(unpack({"admin", "store", "dev"})),id=user_id(),lang=vue_lang()})
end

function store_log()
    local fs   = require "nixio.fs"
    local code = 0
    local e = fs.readfile("/var/log/istore.stderr")
    local o = fs.readfile("/var/log/istore.stdout")
    if o ~= nil then
        code = 206
    end
    luci.http.prepare_content("application/json")
    luci.http.write_json({code=code,stdout=o or "",stderr=e or ""})
end

function action_user_id()
    luci.http.prepare_content("application/json")
    luci.http.write_json(user_id())
end

function check_self_upgrade()
    local ret = {
        code = 500,
        msg = "Unknown"
    }
    local r,o,e = is_exec(myopkg .. " check_self_upgrade")
    if r ~= 0 then
        ret.msg = e
    else
        ret.code = o == "" and 304 or 200
        ret.msg = o:gsub("[\r\n]", "")
    end
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end

function do_self_upgrade()
    local code, out, err, ret
    code,out,err = is_exec(myopkg .. " do_self_upgrade")
    ret = {
        code = code,
        stdout = out,
        stderr = err
    }
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end

-- Internal action function
local function _action(exe, cmd, ...)

    local pkg = ""
    for k, v in pairs({...}) do
        pkg = pkg .. " " .. luci.util.shellquote(v)
    end

    local c = "%s %s %s" %{ exe, cmd, pkg }

    return is_exec(c, true)
end

function store_action(param)
    local metadir = "/usr/lib/opkg/meta"
    local metapkgpre = "app-meta-"
    local code, out, err, ret, out0, err0
    local fs = require "nixio.fs"
    local ipkg = require "luci.model.ipkg"
    local jsonc = require "luci.jsonc"
    local json_parse = jsonc.parse
    local action = param.action or ""

    if action == "status" then
        local pkg = luci.http.formvalue("package")
        local metapkg = metapkgpre .. pkg
        local meta = {}
        local metadata = fs.readfile(metadir .. "/" .. pkg .. ".json")

        if metadata ~= nil then
            meta = json_parse(metadata)
        end
        meta.installed = false
        local status = ipkg.status(metapkg)
        if next(status) ~= nil then
            meta.installed=true
            meta.time=tonumber(status[metapkg]["Installed-Time"])
        end

        ret = meta
    elseif action == "installed" then
        local itr = fs.dir(metadir)
        local data = {}
        if itr then
            local pkg
            for pkg in itr do
                if pkg:match("^.*%.json$") then
                    local metadata = fs.readfile(metadir .. "/" .. pkg)
                    if metadata ~= nil then
                        local meta = json_parse(metadata)
                        local metapkg = metapkgpre .. meta.name
                        local status = ipkg.status(metapkg)
                        if next(status) ~= nil then
                            meta.time = tonumber(status[metapkg]["Installed-Time"])
                            data[#data+1] = meta
                        end
                    end
                end
            end
        end
        ret = data
    else
        local pkg = luci.http.formvalue("package")
        local metapkg = pkg and (metapkgpre .. pkg) or ""
        if action == "update" or pkg then
            if action == "update" or action == "install" then
                code, out, err = _action(myopkg, action, metapkg)
            else
                local meta = json_parse(fs.readfile(metadir .. "/" .. pkg .. ".json"))
                local pkgs = {}
                if action == "upgrade" then
                    pkgs = meta.depends
                    table.insert(pkgs, metapkg)
                    code, out, err = _action(myopkg, action, unpack(pkgs))
                else -- remove
                    for _, dep in ipairs(meta.depends) do
                        if dep ~= "docker-deps" then
                            pkgs[#pkgs+1] = dep
                        end
                    end
                    table.insert(pkgs, metapkg)
                    code, out, err = _action(myopkg, action, unpack(pkgs))
                    fs.unlink("/tmp/luci-indexcache")
                end
            end
        else
            code = 400
            err = "package is null"
        end

        ret = {
            code = code,
            stdout = out,
            stderr = err
        }
    end

    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end

function store_token()
    luci.http.prepare_content("application/json")
    require "luci.template".render_string("{\"token\":\"<%=token%>\"}")
end

function store_upload()
    local fd
    local path
    local finished = false
    local tmpdir = "/tmp/is-root/tmp"
    luci.http.setfilehandler(
        function(meta, chunk, eof)
            if not fd then
                path = tmpdir .. "/" .. meta.file
                nixio.fs.mkdirr(tmpdir)
                fd = io.open(path, "w")
            end
            if chunk then
                fd:write(chunk)
            end
            if eof then
                fd:close()
                finished = true
            end
        end
    )
    local code, out, err
    out = ""
    if finished then
        if string.lower(string.sub(path, -4, -1)) == ".run" then
            code, out, err = _action("sh", "-c", "ls -l \"%s\"; md5sum \"%s\" 2>/dev/null; chmod 755 \"%s\" && \"%s\"; RET=$?; rm -f \"%s\"; exit $RET" %{ path, path, path, path, path })
        else
            code, out, err = _action("sh", "-c", "opkg install \"%s\"; RET=$?; rm -f \"%s\"; exit $RET" %{ path, path })
        end
    else
        code = 500
        err = "upload failed!"
    end
    --nixio.fs.unlink(path)
    local ret = {
        code = code,
        stdout = out,
        stderr = err
    }
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end

local function split(str,reps)
    local resultStrList = {}
    string.gsub(str,'[^'..reps..']+',function (w)
        table.insert(resultStrList,w)
    end)
    return resultStrList
end

local function ltn12_popen(command)

	local fdi, fdo = nixio.pipe()
	local pid = nixio.fork()

	if pid > 0 then
		fdo:close()
		local close
		return function()
			local buffer = fdi:read(2048)
			local wpid, stat = nixio.waitpid(pid, "nohang")
			if not close and wpid and stat == "exited" then
				close = true
			end

			if buffer and #buffer > 0 then
				return buffer
			elseif close then
				fdi:close()
				return nil
			end
		end
	elseif pid == 0 then
		nixio.dup(fdo, nixio.stdout)
		fdi:close()
		fdo:close()
		nixio.exec("/bin/sh", "-c", command)
	end
end

-- call get_support_backup_features
function get_support_backup_features()
    local jsonc = require "luci.jsonc"
    local error_ret = {code = 500, msg = "Unknown"}
    local success_ret = {code = 200, msg = "Unknown"}
    local r,o,e = is_exec(is_backup .. " get_support_backup_features")
    if r ~= 0 then
        error_ret.msg = e
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    else
        success_ret.code = 200
        success_ret.msg = jsonc.stringify(split(o,'\n'))
        luci.http.prepare_content("application/json")
        luci.http.write_json(success_ret)
    end
end

-- post light_backup
function light_backup()
    local jsonc = require "luci.jsonc"
    local error_ret = {code = 500, msg = "Unknown"}
    local success_ret = {code = 200,msg = "Unknown"}
    local r,o,e = is_exec(is_backup .. " backup")

    if r ~= 0 then
        error_ret.msg = e
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    else
        success_ret.code = 200
        success_ret.msg = o:gsub("[\r\n]", "")
        luci.http.prepare_content("application/json")
        luci.http.write_json(success_ret)
    end
end

-- call get_light_backup_file
function get_light_backup_file()
    local light_backup_cmd  = "tar -c %s | gzip 2>/dev/null"
    local loght_backup_filelist = "/etc/istore/app.list"
    local reader = ltn12_popen(light_backup_cmd:format(loght_backup_filelist))
    luci.http.header('Content-Disposition', 'attachment; filename="light-backup-%s-%s.tar.gz"' % {
        luci.sys.hostname(), os.date("%Y-%m-%d")})
    luci.http.prepare_content("application/x-targz")
    luci.ltn12.pump.all(reader, luci.http.write)
end

local function update_local_backup_path(path)
    local uci = require "uci"
    local fs = require "nixio.fs"
    local x = uci.cursor()
    local local_backup_path

    if fs.access("/etc/config/istore") then
        local_backup_path = x:get("istore","istore","local_backup_path")
    else
        --create config file
        local f=io.open("/etc/config/istore","a+")
        f:write("config istore \'istore\'\n\toption local_backup_path \'\'")
        f:flush()
        f:close()        
    end

    if path ~= local_backup_path then
        -- set uci config
        x:set("istore","istore","local_backup_path",path)
        x:commit("istore")        
    end
end

-- post local_backup
function local_backup()
    local code, out, err, ret
    local error_ret
    local path = luci.http.formvalue("path")
    if path ~= "" then
        -- judge path
        code,out,err = is_exec("findmnt -T " .. path .. " -o TARGET|sed -n 2p")
        if out:gsub("[\r\n]", "") == "/" or out:gsub("[\r\n]", "") == "/tmp" then
            -- error
            error_ret = {code = 500, stderr = "Path Error,Can not be / or tmp."}
            luci.http.prepare_content("application/json")
            luci.http.write_json(error_ret)            
        else
            -- update local backup path
            update_local_backup_path(path)
            code,out,err = _action(is_backup, "backup", path)
            ret = {
                code = code,
                stdout = out,
                stderr = err
            }
            luci.http.prepare_content("application/json")
            luci.http.write_json(ret)
        end
    else
        -- error
        error_ret = {code = 500, stderr = "Path Unknown"}
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end
end

-- post light_restore
function light_restore()
    local fd
    local path
    local finished = false
    local tmpdir = "/tmp/"
    luci.http.setfilehandler(
        function(meta, chunk, eof)
            if not fd then
                path = tmpdir .. "/" .. meta.file
                fd = io.open(path, "w")
            end
            if chunk then
                fd:write(chunk)
            end
            if eof then
                fd:close()
                finished = true
            end
        end
    )

    local code, out, err, ret

    if finished then
        is_exec("rm /etc/istore/app.list;tar -xzf " .. path .. " -C /")
        nixio.fs.unlink(path)
        if nixio.fs.access("/etc/istore/app.list") then
            code,out,err = _action(is_backup, "restore")
            ret = {
                code = code,
                stdout = out,
                stderr = err
            }
            luci.http.prepare_content("application/json")
            luci.http.write_json(ret)
        else
            local error_ret = {code = 500, stderr = "File is error!"}
            luci.http.prepare_content("application/json")
            luci.http.write_json(error_ret)
        end
    else
        ret = {code = 500, stderr = "upload failed!"}
        luci.http.prepare_content("application/json")
        luci.http.write_json(ret)
    end
end

-- post local_restore
function local_restore()
    local path = luci.http.formvalue("path")
    local code, out, err, ret
    if path ~= "" then
        code,out,err = _action(is_backup, "restore", path)
        ret = {
            code = code,
            stdout = out,
            stderr = err
        }
        luci.http.prepare_content("application/json")
        luci.http.write_json(ret)
    else
        -- error
        error_ret = {code = 500, stderr = "Path Unknown"}
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end
end

-- call get_backup_app_list_file_path
function get_backup_app_list_file_path()
    local jsonc = require "luci.jsonc"
    local error_ret = {code = 500, msg = "Unknown"}
    local success_ret = {code = 200,msg = "Unknown"}
    local r,o,e = is_exec(is_backup .. " get_backup_app_list_file_path")
    if r ~= 0 then
        error_ret.msg = e
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    else
        success_ret.code = 200
        success_ret.msg = o:gsub("[\r\n]", "")
        luci.http.prepare_content("application/json")
        luci.http.write_json(success_ret)
    end
end

-- call get_backup_app_list
function get_backup_app_list()
    local jsonc = require "luci.jsonc"
    local error_ret = {code = 500, msg = "Unknown"}
    local success_ret = {code = 200,msg = "Unknown"}
    local r,o,e = is_exec(is_backup .. " get_backup_app_list")
    if r ~= 0 then
        error_ret.msg = e
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    else
        success_ret.code = 200
        success_ret.msg = jsonc.stringify(split(o,'\n'))
        luci.http.prepare_content("application/json")
        luci.http.write_json(success_ret)
    end
end

-- call get_available_backup_file_list
function get_available_backup_file_list()
    local jsonc = require "luci.jsonc"
    local error_ret = {code = 500, msg = "Unknown"}
    local success_ret = {code = 200,msg = "Unknown"}
    local path = luci.http.formvalue("path")
    local r,o,e

    if path ~= "" then
        -- update local backup path
        update_local_backup_path(path)
        r,o,e = is_exec(is_backup .. " get_available_backup_file_list " .. path)
        if r ~= 0 then
            error_ret.msg = e
            luci.http.prepare_content("application/json")
            luci.http.write_json(error_ret)
        else
            success_ret.code = 200
            success_ret.msg = jsonc.stringify(split(o,'\n'))
            luci.http.prepare_content("application/json")
            luci.http.write_json(success_ret)
        end
    else
        -- set error code
        error_ret.msg = "Path Unknown"
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end
end

-- post set_local_backup_dir_path
function set_local_backup_dir_path()
    local path = luci.http.formvalue("path")
    local success_ret = {code = 200,msg = "Success"}
    local error_ret = {code = 500, msg = "Unknown"}

    if path ~= "" then
        -- update local backup path
        update_local_backup_path(path)
        luci.http.prepare_content("application/json")
        luci.http.write_json(success_ret)
    else
        -- set error code
        error_ret.msg = "Path Unknown"
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end        
end

-- call get_local_backup_dir_path
function get_local_backup_dir_path()
    local uci = require "uci"
    local fs = require "nixio.fs"
    local x = uci.cursor()
    local local_backup_path = nil
    local success_ret = {code = 200,msg = "Unknown"}
    local error_ret = {code = 500, msg = "Path Unknown"}

    if fs.access("/etc/config/istore") then
        local_backup_path = x:get("istore","istore","local_backup_path")
        if local_backup_path == nil then
            luci.http.prepare_content("application/json")
            luci.http.write_json(error_ret)
        else
            success_ret.msg = local_backup_path:gsub("[\r\n]", "")
            luci.http.prepare_content("application/json")
            luci.http.write_json(success_ret)
        end 
    else
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end
end

-- copy from /usr/lib/lua/luci/model/diskman.lua
local function byte_format(byte)
  local suff = {"B", "KB", "MB", "GB", "TB"}
  for i=1, 5 do
    if byte > 1024 and i < 5 then
      byte = byte / 1024
    else
      return string.format("%.2f %s", byte, suff[i]) 
    end 
  end
end

-- copy from /usr/libexec/rpcd/luci
local function getBlockDevices()
    local fs = require "nixio.fs"

    local block = io.popen("/sbin/block info", "r")
    if block then
        local rv = {}

        while true do
            local ln = block:read("*l")
            if not ln then
                break
            end

            local dev = ln:match("^/dev/(.-):")
            if dev then
                local s = tonumber((fs.readfile("/sys/class/block/" .. dev .."/size")))
                local e = {
                    dev = "/dev/" .. dev,
                    size = s and byte_format(s * 512)
                }

                local key, val = { }
                for key, val in ln:gmatch([[(%w+)="(.-)"]]) do
                    e[key:lower()] = val
                end

                rv[dev] = e
            end
        end

        block:close()

        return rv
    else
        return
    end
end

function get_block_devices()
    local error_ret = {code = 500, msg = "Unable to execute block utility"}
    local devices = getBlockDevices()
    if devices ~= nil then
        luci.http.prepare_content("application/json")
        luci.http.write_json({code = 200, data = devices})
    else
        luci.http.prepare_content("application/json")
        luci.http.write_json(error_ret)
    end
end
