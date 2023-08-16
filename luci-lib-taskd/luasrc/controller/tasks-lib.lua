
module("luci.controller.tasks-lib", package.seeall)


function index()
  entry({"admin", "system", "tasks"}, call("tasks_ping")).dependent=false -- just for compatible
  entry({"admin", "system", "tasks", "status"}, call("tasks_status")).dependent=false
  entry({"admin", "system", "tasks", "log"}, call("tasks_log")).dependent=false
  entry({"admin", "system", "tasks", "stop"}, post("tasks_stop")).dependent=false
end

local util  = require "luci.util"
local jsonc = require "luci.jsonc"
local ltn12 = require "luci.ltn12"

local taskd = require "luci.model.tasks"

function tasks_ping()
  luci.http.prepare_content("application/json")
  luci.http.write_json({})
end

function tasks_status()
  local data = taskd.status(luci.http.formvalue("task_id"))
  luci.http.prepare_content("application/json")
  luci.http.write_json(data)
end

function tasks_log()
  local wait = 107
  local task_id = luci.http.formvalue("task_id")
  local offset = luci.http.formvalue("offset")
  offset = offset and tonumber(offset) or 0
  local logpath = "/var/log/tasks/"..task_id..".log"
  local i
  local logfd = io.open(logpath, "rb")
  if logfd == nil then
    luci.http.status(404)
    luci.http.write("log not found")
    return
  end

  local size = logfd:seek("end")

  if size < offset then
    luci.http.status(205, "Reset Content")
    luci.http.write("reset offset")
    return
  end

  i = 0
  while (i < wait)
  do
    if size > offset then
      break
    end
    nixio.nanosleep(0, 10000000) -- sleep 10ms
    size = logfd:seek("end")
    i = i+1
  end
  if i == wait then
    logfd:close()
    luci.http.status(204)
    luci.http.prepare_content("application/octet-stream")
    return
  end
  logfd:seek("set", offset)

  local write_log = function()
    local buffer = logfd:read(4096)
    if buffer and #buffer > 0 then
        return buffer
    else
        logfd:close()
        return nil
    end
  end

  luci.http.prepare_content("application/octet-stream")

  if logfd then
    ltn12.pump.all(write_log, luci.http.write)
  end
end

function tasks_stop()
  local sys = require("luci.sys")
  local task_id = luci.http.formvalue("task_id") or ""
  if task_id == "" then
    luci.http.status(400)
    luci.http.write("task_id is empty")
    return
  end
  if sys.call("/etc/init.d/tasks task_del "..task_id.." >/dev/null 2>&1") ~= 0 then
    nixio.nanosleep(2, 10000000)
  end
  luci.http.status(204)
end
