module("luci.controller.store", package.seeall)

local myopkg = "is-opkg"
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

local function is_exec(cmd)
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

    local r = os.execute(cmd .. " >/var/log/istore.stdout 2>/var/log/istore.stderr")
    local e = fs.readfile("/var/log/istore.stderr")
    local o = fs.readfile("/var/log/istore.stdout")

    fs.unlink("/var/log/istore.stderr")
    fs.unlink("/var/log/istore.stdout")

    lock:lock("ulock")
    lock:close()

    e = e or ""
    if r == 256 and e == "" then
        e = "os.execute failed, is /var/log full or not existed?"
    end
    return rshift(r,8), o or "", e or ""
end

function redirect_index()
    luci.http.redirect(luci.dispatcher.build_url(unpack(page_index)))
end

function store_index()
    luci.template.render("store/main", {prefix=luci.dispatcher.build_url(unpack(page_index)),id=user_id()})
end

function store_dev()
    luci.template.render("store/main_dev", {prefix=luci.dispatcher.build_url(unpack({"admin", "store", "dev"})),id=user_id()})
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
    local os   = require "os"
    local fs   = require "nixio.fs"

    local pkg = ""
    for k, v in pairs({...}) do
        pkg = pkg .. " '" .. v:gsub("'", "") .. "'"
    end

    local c = "%s %s %s" %{ exe, cmd, pkg }

    return is_exec(c)
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
                    local meta = json_parse(fs.readfile(metadir .. "/" .. pkg))
                    local metapkg = metapkgpre .. meta.name
                    local status = ipkg.status(metapkg)
                    if next(status) ~= nil then
                        meta.time = tonumber(status[metapkg]["Installed-Time"])
                        data[#data+1] = meta
                    end
                end
            end
        end
        ret = data
    else
        local pkg = luci.http.formvalue("package")
        local metapkg = metapkgpre .. pkg
        if action == "update" or pkg then
            if action == "update" or action == "install" then
                code, out, err = _action(myopkg, action, metapkg)
            else
                local meta = json_parse(fs.readfile(metadir .. "/" .. pkg .. ".json"))
                local pkgs = meta.depends
                table.insert(pkgs, metapkg)
                if action == "upgrade" then
                    code, out, err = _action(myopkg, action, unpack(pkgs))
                else -- remove
                    code, out, err = _action(myopkg, action, unpack(pkgs))
                    if code ~= 0 then
                        code, out0, err0 = _action(myopkg, action, unpack(pkgs))
                        out = out .. out0
                        err = err .. err0
                    end
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
            code, out, err = _action("sh", "-c", "chmod 755 \"%s\" && \"%s\"" %{ path, path })
        else
            code, out, err = _action(myopkg, "install", path)
        end
    else
        code = 500
        err = "upload failed!"
    end
    nixio.fs.unlink(path)
    local ret = {
        code = code,
        stdout = out,
        stderr = err
    }
    luci.http.prepare_content("application/json")
    luci.http.write_json(ret)
end
