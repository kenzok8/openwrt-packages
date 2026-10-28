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
print("PASS: package validation, full proxy writes, all chunk boundaries, EOF and header limit")
