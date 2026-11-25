-- Run against a staged source copy: lua tests/security_regression.lua ROOT
-- All LuCI, filesystem and command dependencies are mocked.
local root = assert(arg[1], "source root required")
local forms, response, executions = {}, nil, {}
local http = {
    formvalue = function(key) return forms[key] end,
    prepare_content = function() end,
    write_json = function(value) response = value end,
}
local fs = { readfile = function() return "" end, unlink = function() end }
local nixio = { bit = { rshift = function(value, bits) return math.floor(value / 2^bits) end } }
local util = { shellquote = function(value) return "'" .. value:gsub("'", "'\\''") .. "'" end }
package.preload["luci.http"] = function() return http end
package.preload["luci.util"] = function() return util end
package.preload["luci.ltn12"] = function() return {} end
package.preload["nixio"] = function() return nixio end
package.preload["nixio.fs"] = function() return fs end
_G.luci = { http = http, util = util }
_G.nixio = nixio
local original_execute = os.execute
os.execute = function(command) executions[#executions+1] = command; return 0 end
assert(loadfile(root .. "/luasrc/controller/quickstart.lua"))()
local quickstart = package.loaded["luci.controller.quickstart"]
for _, packages in ipairs({"../other", "--help", "two packages", "pkg'", {"aria2", "../other"}, {"aria2", {}}}) do
    forms, response, executions = {packages=packages}, nil, {}
    quickstart.auto_setup()
    assert(response and response.success ~= 0 and response.scope == "params", "invalid package accepted")
    assert(#executions == 0, "invalid package reached shell")
end
for _, packages in ipairs({"aria2", {"qbittorrent", "foo+bar_1.2-3"}}) do
    forms, response, executions = {packages=packages}, nil, {}
    quickstart.auto_setup()
    assert(response and response.success == 0 and #executions == 1, "normal package failed")
end
os.execute = original_execute

assert(loadfile(root .. "/luasrc/controller/istore_backend.lua"))()
local proxy = package.loaded["luci.controller.istore_backend"].istore_backend
local function upvalue(name)
    for i=1,100 do
        local key, value = debug.getupvalue(proxy, i)
        if not key then break end
        if key == name then return value end
    end
    error("missing proxy helper " .. name)
end
local sink = upvalue("sink_socket")
local sent = ""
assert(sink({sendall=function(_, chunk) sent=sent..chunk; return #chunk end})("whole body"))
assert(sent == "whole body", "proxy did not send complete input")

local chunksource = upvalue("chunksource")
local wire = "5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n"
for split=0,#wire do
    local pos, calls = split+1, 0
    local sock = {}
    function sock:recv(n)
        assert(n > 0, "zero-length receive")
        calls = calls + 1
        assert(calls < 100, "unbounded receive loop")
        local data=wire:sub(pos, pos+math.min(n, 3)-1)
        pos=pos+#data
        return data
    end
    function sock:recvall(n)
        local result=""
        while #result<n do
            local data=self:recv(n-#result)
            if not data or data=="" then return nil, -1 end
            result=result..data
        end
        return result
    end
    local source=chunksource(sock, wire:sub(1,split))
    local output=""
    for i=1,100 do
        local data, err=source()
        assert(not err, "chunk parse failed at split " .. split)
        if not data then break end
        output=output..data
    end
    assert(output=="helloworld", "chunk boundary corrupted body at " .. split)
end
local source=chunksource({recv=function() return "" end}, "incomplete")
assert(source()==nil, "EOF not handled")
source=chunksource({recv=function() error("must not read zero bytes") end}, string.rep("z",1024))
assert(source()==nil, "oversize chunk header accepted")

-- Failed requests must close their socket, and every request must connect again
-- so the next one recovers after a backend restart.
local sockets, connects, closed, status = 0, 0, 0, nil
local request, output = "", ""
local available = false
nixio.connect = function() error("TCP proxy must not be used") end
nixio.socket = function(domain, kind)
    assert(domain == "unix" and kind == "stream", "wrong socket type")
    sockets = sockets + 1
    return {
        connect = function(_, path)
            assert(path == "/var/run/quickstart/http.sock", "wrong HTTP socket path")
            connects = connects + 1
            return available
        end,
        close = function() closed = closed + 1 end,
        sendall = function(_, chunk) request = request .. chunk; return #chunk end,
        linesource = function()
            local lines, index = {"HTTP/1.1 200 OK", "Content-Type: application/json", ""}, 0
            return function(buffer)
                if buffer then return '{"success":0}' end
                index = index + 1
                return lines[index]
            end
        end,
        blocksource = function() return function() end end,
    }
end
http.status = function(code) status = code end
proxy()
assert(status == 500 and connects == 1 and closed == 1, "failed connection leaked socket")

available = true
local env = {REQUEST_METHOD="GET", REQUEST_URI="/cgi-bin/luci/istore/system/version/"}
http.getenv = function(key) return env[key] end
http.context = {request={message={env={HTTP_HOST="router.test", HTTP_X_FORWARDED_SID="spoofed"}}}}
http.getcookie = function(name) if name == "sysauth_http" then return "session" end end
util.ubus = function() return {values={username="root", token="secret"}} end
http.header = function() end
http.write = function(chunk) output = output .. chunk; return 1 end
http.source = function() return function() end end
local ltn12 = package.loaded["luci.ltn12"]
ltn12.source = {
    string = function(value)
        return function() local result = value; value = nil; return result end
    end,
    cat = function(...)
        local sources, index = {...}, 1
        return function()
            while sources[index] do
                local chunk = sources[index]()
                if chunk then return chunk end
                index = index + 1
            end
        end
    end,
}
ltn12.pump = {all=function(source, send)
    while true do
        local chunk = source()
        if not chunk then return 1 end
        if not send(chunk) then return nil end
    end
end}
proxy()
assert(status == 200 and sockets == 2 and connects == 2 and closed == 2,
    "request did not recover after backend restart or leaked socket")
assert(output == '{"success":0}', "proxy corrupted HTTP response")
assert(request:find("HOST: router.test", 1, true), "original Host lost")
assert(request:find("X-Forwarded-Sid: session", 1, true) and
    request:find("X-Forwarded-Token: secret", 1, true), "validated credentials lost")
assert(not request:find("spoofed", 1, true), "client forwarded header trusted")
nixio.socket = function() return nil end
proxy()
assert(status == 500 and closed == 2, "socket creation failure not handled")
print("PASS: package validation, full proxy writes, chunk boundaries, EOF, header limit and Unix proxy recovery")
