local util  = require "luci.util"
local jsonc = require "luci.jsonc"

local taskd = {}

local function output(data)
    local ret={}
    ret.running=data.running
    if not data.running then
      ret.exit_code=data.exit_code
      if nil == ret.exit_code then
        if data["data"] and data["data"]["exit_code"] and data["data"]["exit_code"] ~= "" then
          ret.exit_code=tonumber(data["data"]["exit_code"])
        else
          ret.exit_code=143
        end
      end
    end
    ret.command=data["command"] and data["command"][4] or '#'
    if data["data"] then
        ret.start=tonumber(data["data"]["start"])
        if not data.running and data["data"]["stop"] then
            ret.stop=tonumber(data["data"]["stop"])
        end
    end
    return ret
end

taskd.status = function (task_id)
  task_id = task_id or ""
  local data = util.trim(util.exec("/etc/init.d/tasks task_status "..task_id.." 2>/dev/null")) or ""
  if data ~= "" then
    data = jsonc.parse(data)
  else
    if task_id == "" then
      data = {}
    else
      data = {running=false, exit_code=404}
    end
  end
  if task_id ~= "" then
    return output(data)
  end
  local ary={}
  for k, v in pairs(data) do
    ary[k] = output(v)
  end
  return ary
end

taskd.docker_map = function(config, task_id, script_path, title, desc)
  require("luci.cbi")
  require("luci.http")
  require("luci.sys")
  local translate = require("luci.i18n").translate
  local m
  m = luci.cbi.Map(config, title, desc)
  m.template = "tasks/docker"
  -- hide default buttons
  m.pageaction = false
  -- we want hook 'on_after_apply' works, 'apply_on_parse' can be true (rollback) or false (no rollback),
  -- but 'apply_on_parse' must be true for luci 17.01 and below
  m.apply_on_parse = true
  m.script_path = script_path
  m.task_id = task_id
  m.auto_show_task = true
  m.on_before_apply = function(self)
    if self.uci.rollback then
      -- luci 18.06+ has 'rollback' function
      -- rollback dialog will show because 'apply_on_parse' is true,
      -- hide rollback dialog by hook 'apply' function
      local apply = self.uci.apply
      self.uci.apply = function(uci, rollback)
        apply(uci, false)
      end
    end
  end
  m.on_after_apply = function(self)
    local cmd
    local action = luci.http.formvalue("cbi.apply") or "null"
    if "upgrade" == action or "install" == action
        or "start" == action or "stop" == action or "restart" == action or "rm" == action then
      cmd = string.format("\"%s\" %s", script_path, action)
    end
    if cmd then
      if luci.sys.call("/etc/init.d/tasks task_add " .. task_id .. " " .. luci.util.shellquote(cmd) .. " >/dev/null 2>&1") ~= 0 then
        self.task_start_failed = true
        self.message = translate("Config saved, but apply failed")
      end
    else
      self.message = translate("Unknown command: ") .. action
    end
    if self.message then
      self.auto_show_task = false
    end
  end
  return m
end

return taskd
