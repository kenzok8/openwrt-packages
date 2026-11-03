-- SPDX-License-Identifier: Apache-2.0
-- Lua 5.1 / nixio, including OpenWrt 19.07. No daemon, cache or core execution.
local M = {}
local MAX_LINES, MAX_LINE, MAX_EVENTS, MAX_EXCERPT = 600, 1024, 6, 900

local function origin(line, source)
 if source == "dmesg" then return "kernel", nil, line end
 local payload = line:match("^.-%s%a+%.%a+%s+(.+)$") or line
 local tag, pid, body = payload:match("^([%w_./%-]+)%[(%d+)%]:%s?(.*)$")
 if not tag then tag, body = payload:match("^([%w_./%-]+):%s?(.*)$") end
 return (tag or ""):lower(), pid, body or line
end

local function classify(tag, body)
 local lower = body:lower()
 if tag == "kernel" then
  -- The process invoking the OOM killer is not necessarily its victim.
  if lower:match("killed process%s+%d+%s+%(lucky%)") or
    (lower:find("oom-kill:", 1, true) and lower:match("task=lucky[, ]")) then return "oom" end
  if lower:match("lucky%[%d+%].-segfault") or
    lower:match("lucky%[%d+%].-unhandled signal") or
    lower:match("lucky: unhandled") then return "crash" end
 elseif tag == "lucky" then
  if lower:match("^panic:") or lower:match("^fatal error:") or
    lower:match("^runtime: out of memory") or lower:match("^sigsegv:") or
    lower:match("^sigabrt:") or lower:match("^sigbus:") or lower:match("^sigill:") then return "crash" end
 elseif tag == "procd" and lower:match("^instance lucky::") then
  if lower:find("in a crash loop", 1, true) then return "restart_loop" end
  local code = lower:match("exit with error code%s+(%d+)") or lower:match("exit%s+code%s+(%d+)")
  -- SIGTERM (15 / shell-style 143) is commonly a deliberate service stop.
  if code and tonumber(code) ~= 0 and tonumber(code) ~= 15 and tonumber(code) ~= 143 then return "exit" end
 end
end

-- Input order is preserved within each source. Never infer a common clock for
-- syslog wall time and dmesg uptime, or infer an OOM from an exit status alone.
function M.parse(lines, source)
 local events, active = {}, nil
 for _, line in ipairs(lines) do
  local tag, pid, body = origin(line, source)
  local kind = classify(tag, body)
  if kind then
   local key = tag == "kernel" and body:gsub("^%[%s*[%d.]+%]%s*", "") or nil
   active = {source=source, kind=kind, text=line:sub(1, MAX_EXCERPT), key=key, pid=pid, tag=tag, context=0}
   events[#events + 1] = active
   if #events > MAX_EVENTS then table.remove(events, 1) end
  elseif active and tag == "lucky" and active.tag == tag and pid == active.pid and active.context < 5 then
   active.text = (active.text .. "\n" .. line):sub(1, MAX_EXCERPT)
   active.context = active.context + 1
  else active = nil end
 end
 for _, event in ipairs(events) do event.pid = nil; event.tag = nil; event.context = nil end
 return events
end

local function command(name)
 local fs = require "nixio.fs"
 for _, dir in ipairs({"/sbin/", "/usr/sbin/", "/bin/", "/usr/bin/"}) do
  if fs.access(dir .. name, "x") then return {dir .. name} end
 end
 -- BusyBox applets are not always installed as individual symlinks.
 if fs.access("/bin/busybox", "x") then return {"/bin/busybox", name} end
end

function M.read(argv)
 if not argv then return {}, "unavailable" end
 local n = require "nixio"
 local input, output = n.pipe()
 if not input then return {}, "failed" end
 if not input:setblocking(false) then input:close(); output:close(); return {}, "failed" end
 local pid = n.fork()
 if not pid then input:close(); output:close(); return {}, "failed" end
 if pid == 0 then
  input:close()
  local null = n.open("/dev/null", "r+")
  if not null or not n.dup(null, n.stdin) or not n.dup(null, n.stderr) or not n.dup(output, n.stdout) then os.exit(127) end
  null:close(); output:close()
  n.exec(unpack(argv)); os.exit(127)
 end
 output:close()
 local ring, count, pending, bytes = {}, 0, "", 0
 local reaped, state, code, status, clipped = false, nil, nil, "timeout", false
 local function line(value)
  count = count + 1
  ring[(count - 1) % MAX_LINES + 1] = value:gsub("[%z\1-\8\11-\31\127]", "?")
 end
 local ok = pcall(function()
  -- Bounded reads keep even a broken or continuously writing log tool below
  -- three seconds per source and 4 MiB scanned, without retaining that buffer.
  for _ = 1, 30 do
   local eof = false
   for _ = 1, 32 do
    local chunk, err = input:read(4096)
    if not chunk then
     if err ~= 11 and err ~= 4 then status = "failed"; return end
     break
    end
    if #chunk == 0 then eof = true; break end
    bytes = bytes + #chunk
    local start = 1
    while start <= #chunk do
     local last = chunk:find("\n", start, true)
     local part = chunk:sub(start, last and last - 1 or #chunk)
     if #pending + #part > MAX_LINE then clipped = true end
     pending = (pending .. part):sub(1, MAX_LINE)
     if not last then break end
     line(pending); pending = ""; start = last + 1
    end
    if bytes >= 4 * 1024 * 1024 then status = "limited"; return end
   end
   if not reaped then
    local done
    done, state, code = n.waitpid(pid, "nohang")
    reaped = done == pid
   end
   if reaped and eof then
    status = state == "exited" and code == 0 and "ok" or "failed"
    return
   end
   n.nanosleep(0, 100000000)
  end
 end)
 input:close()
 if not reaped then n.kill(pid, 9); n.waitpid(pid) end
 if not ok then status = "failed" end
 if pending ~= "" then line(pending) end
 local lines = {}
 for i = math.max(1, count - MAX_LINES + 1), count do lines[#lines + 1] = ring[(i - 1) % MAX_LINES + 1] end
 return lines, status, clipped or count > MAX_LINES
end

function M.collect(reader)
 local result, seen = {sources={}, events={}}, {}
 for _, source in ipairs({"logread", "dmesg"}) do
  local lines, status, truncated
  if reader then lines, status, truncated = reader(source)
  else lines, status, truncated = M.read(command(source)) end
  result.sources[#result.sources + 1] = {name=source, status=status, truncated=truncated or false}
  -- Failed commands may print diagnostics that happen to look like a log.
  if status == "ok" or status == "limited" or status == "timeout" then
   for _, event in ipairs(M.parse(lines, source)) do
    if source == "logread" or not event.key or not seen[event.key] then
     if event.key then seen[event.key] = true end
     event.key = nil
     result.events[#result.events + 1] = event
    end
   end
  end
 end
 return result
end
return M
