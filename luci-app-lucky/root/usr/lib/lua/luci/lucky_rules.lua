-- SPDX-License-Identifier: Apache-2.0
local fs, ip, json = require "nixio.fs", require "luci.ip", require "luci.jsonc"
local M = {}
local function must(v, why) if not v then error(why, 0) end return v end
local function read(path, limit)
 local st = fs.lstat(path)
 if not st then return nil end
 must(st.type == "reg" and st.nlink == 1 and st.size <= limit, "Rules file must be a regular file within the size limit")
 local f = must(io.open(path, "rb"), "Cannot read rules file")
 local data = f:read(limit + 1); f:close()
 must(data and #data <= limit, "Rules file exceeds size limit")
 return data
end
local function write(path, data)
 local f = must(io.open(path, "wb"), "Cannot write rules file")
 local ok = f:write(data); local closed = f:close()
 must(ok and closed, "Cannot finish rules write")
end
function M.validate(content, allowlist)
 must(type(content) == "string" and #content <= 65536, "Rules limit: 64 KiB")
 content = content:gsub("^\239\187\191", ""):gsub("\r\n", "\n")
 must(not content:find("[%z\1-\8\11\12\14-\31\127]"), "Rules contain control characters")
 local count = 0
 for line in (content .. "\n"):gmatch("([^\n]*)\n") do
  count = count + 1; line = line:match("^%s*(.-)%s*$")
  if line ~= "" and not (allowlist and line:sub(1, 1) == "#") then
   local address, prefix = line:match("^([^/]+)/(%d+)$")
   address = address or line
   local parsed = not address:find("[%%/%s]", 1) and ip.new(address)
   local valid = parsed and (address:find(":", 1, true) or address:match("^%d+%.%d+%.%d+%.%d+$"))
   if not address:find(":", 1, true) then
    for octet in address:gmatch("[^.]+") do
     if (#octet > 1 and octet:sub(1, 1) == "0") then valid = false end
    end
   end
   if allowlist and prefix then valid = false end
   if prefix and tonumber(prefix) > (address:find(":", 1, true) and 128 or 32) then valid = false end
   must(valid, "Invalid IP or network at line " .. count)
  end
 end
 return content
end
function M.open(work, directory, name)
 must(name == "localips" or name == "ip-allowlist.txt", "Unsupported rules file")
 local version, fingerprint
 if name == "ip-allowlist.txt" then
  version, fingerprint = require("luci.lucky_core").version(work)
  local major, minor, patch = version:match("^v?(%d+)%.(%d+)%.(%d+)$")
  must(major and (tonumber(major) > 3 or (tonumber(major) == 3 and tonumber(minor) >= 1)), "IP allowlist requires Lucky 3.1.0 or later (stable version)")
 end
 local content = read(directory .. "/" .. name, 65536)
 write(work .. "/rules-snapshot", json.stringify({name=name, directory=directory, exists=content ~= nil, content=content or "", core=fingerprint}))
 return {name=name, directory=directory, content=content or "", version=version}
end
function M.save(work, directory, token)
 local snapshot = must(json.parse(must(read(work .. "/rules-snapshot", 524288), "Load rules first")), "Invalid rules snapshot")
 must(snapshot.directory == directory, "Configuration directory changed; reload rules")
 local name = snapshot.name
 must(name == "localips" or name == "ip-allowlist.txt", "Unsupported rules file")
 if name == "ip-allowlist.txt" then must(snapshot.core == require("luci.lucky_core").fingerprint(), "Core changed; reload rules") end
 local payload = must(json.parse(must(read(work .. "/rules.json", 524288), "Missing rules upload")), "Invalid rules upload")
 local content = M.validate(payload.content, name == "ip-allowlist.txt")
 local path = directory .. "/" .. name
 local current = read(path, 65536)
 must((current ~= nil) == snapshot.exists and (current or "") == snapshot.content, "Rules changed elsewhere; reload before saving")
 local temp = directory .. "/.lucky-rules-" .. token
 must(not fs.lstat(temp), "Rules staging file already exists")
 local ok, err = pcall(function()
  write(temp, content); must(fs.chmod(temp, "600"), "Cannot protect rules file")
  must(fs.rename(temp, path), "Cannot replace rules file")
 end)
 if not ok then fs.unlink(temp); error(err, 0) end
 return {name=name, bytes=#content}
end
return M
