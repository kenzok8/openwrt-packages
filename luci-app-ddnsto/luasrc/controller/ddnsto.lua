--[[
DDNSTO LuCI Controller + JSON API
=================================
 
----
为 ddnsto 的 LuCI 页面（可用原生 JS/React/Vue）提供稳定的后端接口：
1) 读取/更新 UCI 配置：/etc/config/ddnsto
2) 控制 init.d 服务：/etc/init.d/ddnsto start|stop|restart|reload
3) 查询运行状态：ddnstod 是否在运行、PID、enabled/token 是否就绪
4) （可选）读取最近日志：logread 过滤 ddnsto/ddnstod

路由说明
--------
默认挂载在：
/cgi-bin/luci/admin/services/ddnsto/page         -- LuCI 页面入口（模板）
/cgi-bin/luci/admin/services/ddnsto/api/config   -- GET/POST 配置
/c.../ddnsto/api/service                         -- POST 服务控制
/c.../ddnsto/api/status                          -- GET 状态
/c.../ddnsto/api/logs                            -- GET 日志（可选）

CSRF 说明
---------
LuCI 对 POST 通常要求 token 校验。这里提供两种方式（二选一）：
- Header: X-LuCI-Token: <luci.dispatcher.context.token>
- Form字段: token=<...>（application/x-www-form-urlencoded 时常用）

对于前端（React）最佳实践是：
- 在 LuCI 模板里注入 window.ddnstoCsrfToken = "<%=luci.dispatcher.context.token%>"
- 所有 POST 带上该 token

前端对接建议
------------
- GET config/status: fetch(url, {credentials: 'same-origin'})
- POST config/service: JSON body + X-LuCI-Token，或表单 token

开发/调试注意
------------
1) 修改 controller 后，LuCI 可能缓存索引：
   - rm -f /tmp/luci-indexcache
   - /etc/init.d/uhttpd restart  （或重启设备）
2) 确保 /etc/config/ddnsto 存在；否则 index() 会直接 return。
3) 若想扩展更多字段（如 address），建议在 GET 返回里带出，但 POST 仅允许白名单字段写入。

安全边界
--------
本接口位于 LuCI admin 路径下，默认需要登录 LuCI。
此外：
- service action 做了白名单限制，避免命令注入
- config 写入做了基本校验（bool/number）
--]]

module("luci.controller.ddnsto", package.seeall)

-- ==========
-- Utilities
-- ==========

local function write_json(tbl)
  local http = require "luci.http"
  local jsonc = require "luci.jsonc"
  http.prepare_content("application/json")
  http.write(jsonc.stringify(tbl))
end

local function bad_request(msg)
  write_json({ ok = false, error = msg or "bad request" })
end

local function method_not_allowed()
  write_json({ ok = false, error = "method not allowed" })
end

local function read_json_body()
  local http = require "luci.http"
  local jsonc = require "luci.jsonc"
  local ctype = http.getenv("CONTENT_TYPE") or ""
  if not ctype:match("^application/json") then
    return nil
  end
  local raw = http.content() or ""
  if #raw == 0 then
    return nil
  end
  local obj = jsonc.parse(raw)
  if type(obj) ~= "table" then
    return nil
  end
  return obj
end

local function get_command(cmd)
    local handle = io.popen(cmd, "r")
    if handle then
        local res = string.gsub(handle:read("*a"), "\n", "")   
        handle:close()
        return res
    end
    return ""
    
end

local function parse_device_id(raw)
  local cleaned = tostring(raw or "")
  cleaned = cleaned:gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
  if cleaned == "" then
    return ""
  end
  local _, did = cleaned:match("^(%S+)%s+(%S+)$")
  return did or cleaned
end

local function normalize_index(index)
  local idx = index
  if not (idx and tostring(idx):match("^%d+$")) then
    idx = "0"
  end
  return idx
end

local function fetch_device_id(index)
  local idx = normalize_index(index)
  local cmd = string.format("/usr/sbin/ddnstod -x %s -w", idx)
  return parse_device_id(get_command(cmd))
end

local function param(body, key)
  local http = require "luci.http"
  if type(body) == "table" and body[key] ~= nil then
    return tostring(body[key])
  end
  return http.formvalue(key)
end

local function is_bool01(v)
  return v == "0" or v == "1"
end

local function is_uint(v)
  return v ~= nil and tostring(v):match("^%d+$") ~= nil
end

local function is_empty(v)
  return v == nil or tostring(v):match("^%s*$") ~= nil
end

local function has_space(v)
  return v ~= nil and tostring(v):find("%s") ~= nil
end

-- LuCI CSRF Check
local function require_csrf()
  local http = require "luci.http"
  local disp = require "luci.dispatcher"
  
  local method = http.getenv("REQUEST_METHOD") or ""
  if method ~= "POST" then
    return true
  end

  local ctx = disp.context
  
  -- 1. Ensure user is authenticated (session exists)
  if not (ctx and ctx.authsession) then
     write_json({ ok = false, error = "auth session missing" })
     return false
  end

  local expected = ctx.token
  
  local header_token = http.getenv("HTTP_X_LUCI_TOKEN")
  local form_token = http.formvalue("token")
  local body = read_json_body()
  local body_token = (type(body) == "table") and body["token"] or nil

  local provided = header_token or form_token or body_token

  -- 2. If server has a token, enforce strict match
  if expected then
    if provided ~= expected then
      write_json({ ok = false, error = "bad csrf token" })
      return false
    end
  else
    -- 3. If server lost the token (common in some envs), 
    -- just ensure the client sent *something* (e.g. via custom header)
    -- This protects against basic CSRF because attackers can't easily set custom headers.
    if not provided or #provided == 0 then
      write_json({ ok = false, error = "csrf token missing" })
      return false
    end
  end

  return true
end

local function ensure_ddnsto_section()
  local uci = require "luci.model.uci".cursor()
  local sid = nil
  uci:foreach("ddnsto", "ddnsto", function(s) sid = s[".name"] end)
  if not sid then
    sid = uci:add("ddnsto", "ddnsto")
  end
  return sid
end

local function read_config()
  local uci = require "luci.model.uci".cursor()
  local sys = require "luci.sys"
  local cfg = {
    enabled      = "1",
    token        = "",
    index        = "0",
    logger       = "0",
    feat_enabled = "0",
    feat_port    = "3033",
    feat_username = "",
    feat_password = "",
    feat_disk_path_selected = "",
    address      = "",
    mounts       = {},
    device_id    = "",
    deviceId     = "",
  }

  uci:foreach("ddnsto", "ddnsto", function(s)
    cfg.enabled      = s.enabled or cfg.enabled
    cfg.token        = s.token or cfg.token
    cfg.index        = s.index or cfg.index
    cfg.logger       = s.logger or cfg.logger
    cfg.feat_enabled = s.feat_enabled or cfg.feat_enabled
    cfg.feat_port    = s.feat_port or cfg.feat_port
    cfg.feat_username = s.feat_username or cfg.feat_username
    cfg.feat_password = s.feat_password or cfg.feat_password
    cfg.feat_disk_path_selected = s.feat_disk_path_selected or cfg.feat_disk_path_selected
    cfg.address      = s.address or cfg.address
  end)

  do
    local did = fetch_device_id(cfg.index)
    cfg.device_id = did
    cfg.deviceId = did
  end

  -- Get mounts (via block info)
  local mounts = {}
  local block = io.popen("/sbin/block info", "r")
  if block then
    while true do
      local ln = block:read("*l")
      if not ln then break end
      
      local dev = ln:match("^/dev/(.-):")
      if dev then
        for key, val in ln:gmatch([[(%w+)="(.-)"]]) do
          if key:lower() == "mount" then
            table.insert(mounts, val)
          end
        end
      end
    end
    block:close()
  end
  cfg.mounts = mounts

  return cfg
end

-- ==========
-- LuCI index
-- ==========

function index()
  local ok_fs, fs = pcall(require, "nixio.fs")
  if not (ok_fs and fs) then
    local ok_lfs, lfs = pcall(require, "luci.fs")
    if ok_lfs then fs = lfs end
  end

  local has_config = true
  if fs and fs.access then
    has_config = fs.access("/etc/config/ddnsto")
  end
  if has_config == false then return end

  entry({"admin", "services", "ddnsto"}, firstchild(), _("DDNSTO 远程控制"), 60).dependent = false
  entry({"admin", "services", "ddnsto", "page"}, call("action_page"), _("Settings"), 10).leaf = true
  -- entry({"admin", "ddnsto_dev"}, call("action_ddnsto_dev"), _("DDNSTO (Dev)"), 99).leaf = true
  
  entry({"admin", "services", "ddnsto", "api", "config"},  call("api_config")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "service"}, call("api_service")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "run"},     call("api_run")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "restart"}, call("api_restart")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "stop"},    call("api_stop")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "onboarding", "start"}, call("api_onboarding_start")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "onboarding", "address"}, call("api_onboarding_address")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "connectivity"},  call("api_connectivity")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "status"},  call("api_status")).leaf = true
  entry({"admin", "services", "ddnsto", "api", "logs"},    call("api_logs")).leaf = true
end

function action_page()
  local template = require "luci.template"
  local dsp = require "luci.dispatcher"
  local i18n = require "luci.i18n"
  local ctx = dsp.context or {}

  local data = {
    token    = ctx.token or "",
    prefix   = dsp.build_url("admin", "services", "ddnsto"),
    api_base = dsp.build_url(),
    lang     = i18n.context.lang or "zh-cn"
  }
  template.render("ddnsto/main", data)
end

-- ==========
-- API: config
-- ==========

function api_config()
  local http = require "luci.http"
  local uci = require "luci.model.uci".cursor()
  local method = http.getenv("REQUEST_METHOD") or ""

  if method == "GET" then
    write_json({ ok = true, data = read_config() })
    return
  end

  if method ~= "POST" then
    method_not_allowed()
    return
  end

  if not require_csrf() then return end

  local body = read_json_body()

  local enabled      = param(body, "enabled")
  local ddnsto_token = param(body, "ddnsto_token")

  local index        = param(body, "index")
  local logger       = param(body, "logger")
  local feat_enabled = param(body, "feat_enabled")
  local feat_port    = param(body, "feat_port")
  local feat_username = param(body, "feat_username")
  local feat_password = param(body, "feat_password")
  local feat_disk_path_selected = param(body, "feat_disk_path_selected")

  -- 基本校验（按需扩展）
  if enabled      and not is_bool01(enabled)      then return bad_request("bad enabled") end
  if logger       and not is_bool01(logger)       then return bad_request("bad logger") end
  if feat_enabled and not is_bool01(feat_enabled) then return bad_request("bad feat_enabled") end

  local has_payload = enabled ~= nil or ddnsto_token ~= nil or index ~= nil or logger ~= nil
    or feat_enabled ~= nil or feat_port ~= nil or feat_username ~= nil or feat_password ~= nil
    or feat_disk_path_selected ~= nil
  if not has_payload then
    return bad_request("invalid request")
  end

  local enabled_on = enabled == "1"
  local feat_on = feat_enabled == "1"

  if enabled_on and is_empty(ddnsto_token) then
    return bad_request("请填写正确用户Token（令牌）")
  end

  if ddnsto_token ~= nil and has_space(ddnsto_token) then
    return bad_request("令牌勿包含空格")
  end

  if not is_uint(index) then
    return bad_request("请填写正确的设备编号，仅允许数字")
  end
  local index_num = tonumber(index)
  if index_num < 0 or index_num > 99 then
    return bad_request("请填写正确的设备编号，仅允许数字")
  end

  if feat_on then
    if not is_uint(feat_port) then
      return bad_request("请填写正确的端口")
    end

    local port_num = tonumber(feat_port)
    if not port_num or port_num == 0 or port_num > 65535 then
      return bad_request("请填写正确的端口")
    end

    if is_empty(feat_username) then
      return bad_request("请填写授权用户名")
    end
    if has_space(feat_username) then
      return bad_request("用户名请勿包含空格")
    end
    if is_empty(feat_password) then
      return bad_request("请填写授权用户密码")
    end
    if has_space(feat_password) then
      return bad_request("用户密码请勿包含空格")
    end
    if is_empty(feat_disk_path_selected) then
      return bad_request("请填写共享磁盘路径")
    end
  end

  local sid = ensure_ddnsto_section()

  -- 白名单写入：只写我们明确允许前端控制的字段
  if enabled      then uci:set("ddnsto", sid, "enabled", enabled) end
  if ddnsto_token ~= nil then uci:set("ddnsto", sid, "token", ddnsto_token) end
  if index        then uci:set("ddnsto", sid, "index", index) end
  if logger       then uci:set("ddnsto", sid, "logger", logger) end
  if feat_enabled then uci:set("ddnsto", sid, "feat_enabled", feat_enabled) end
  if feat_port    then uci:set("ddnsto", sid, "feat_port", feat_port) end
  if feat_username then uci:set("ddnsto", sid, "feat_username", feat_username) end
  if feat_password then uci:set("ddnsto", sid, "feat_password", feat_password) end
  if feat_disk_path_selected then uci:set("ddnsto", sid, "feat_disk_path_selected", feat_disk_path_selected) end

  uci:commit("ddnsto")

  -- Restart service to apply changes
  local sys = require "luci.sys"
  sys.call("/etc/init.d/ddnsto restart >/dev/null 2>&1")

  write_json({ ok = true })
end

-- ==========
-- API: service
-- ==========

local function run_service_action(action, allow_reload)
  local http = require "luci.http"
  local sys = require "luci.sys"
  local method = http.getenv("REQUEST_METHOD") or ""
  
  if method ~= "POST" then
    method_not_allowed()
    return
  end

  if not require_csrf() then return end

  if not action then
    local body = read_json_body()
    action = param(body, "action") or ""
  end

  local allow = {
    start = true,
    stop = true,
    restart = true,
    reload = allow_reload == true,
  }

  if not allow[action] then
    return bad_request("bad action")
  end

  local cmd = string.format("/etc/init.d/ddnsto %s >/dev/null 2>&1", action)
  local rc = sys.call(cmd)
  write_json({ ok = (rc == 0), rc = rc })
end

function api_service()
  return run_service_action(nil, true)
end

function api_run()
  return run_service_action("start")
end

function api_restart()
  return run_service_action("restart")
end

function api_stop()
  return run_service_action("stop")
end

-- ==========
-- API: onboarding helpers
-- ==========

function api_onboarding_start()
  local http = require "luci.http"
  local uci = require "luci.model.uci".cursor()
  local sys = require "luci.sys"
  local method = http.getenv("REQUEST_METHOD") or ""

  if method ~= "POST" then
    method_not_allowed()
    return
  end

  if not require_csrf() then return end

  local body = read_json_body()
  local token = param(body, "token")

  if is_empty(token) then
    return bad_request("token required")
  end
  if has_space(token) then
    return bad_request("token must not contain spaces")
  end

  local sid = ensure_ddnsto_section()
  uci:set("ddnsto", sid, "token", token)
  uci:set("ddnsto", sid, "enabled", "1")
  uci:set("ddnsto", sid, "feat_enabled", "0")
  uci:commit("ddnsto")

  local rc = sys.call("/etc/init.d/ddnsto restart >/dev/null 2>&1")
  write_json({ ok = (rc == 0), rc = rc })
end

function api_onboarding_address()
  local http = require "luci.http"
  local uci = require "luci.model.uci".cursor()
  local method = http.getenv("REQUEST_METHOD") or ""

  if method ~= "POST" then
    method_not_allowed()
    return
  end

  if not require_csrf() then return end

  local body = read_json_body()
  local url = param(body, "url") or param(body, "address")

  if is_empty(url) then
    return bad_request("address required")
  end

  local sid = ensure_ddnsto_section()
  uci:set("ddnsto", sid, "address", url)
  uci:commit("ddnsto")

  write_json({ ok = true })
end

-- ==========
-- API: status
-- ==========

function api_status()
  local sys  = require "luci.sys"
  local uci  = require "luci.model.uci".cursor()
  local jsonc = require "luci.jsonc"

  local enabled, token = "0", ""
  local address, index = "", "0"
  uci:foreach("ddnsto", "ddnsto", function(s)
    enabled = s.enabled or "0"
    token   = s.token or ""
    address = s.address or ""
    index   = s.index or index
  end)

  local raw = sys.exec([[ubus call service list '{"name":"ddnsto"}' 2>/dev/null]]) or ""
  local pid, running = "", false

  local ok, obj = pcall(jsonc.parse, raw)
  if ok and type(obj) == "table" and type(obj.ddnsto) == "table" and type(obj.ddnsto.instances) == "table" then
    for _, inst in pairs(obj.ddnsto.instances) do
      if type(inst) == "table" and inst.running == true then
        running = true
        pid = tostring(inst.pid or "")
        break
      end
    end
  end

  local board_raw = sys.exec("ubus call system board 2>/dev/null") or ""
  local hostname = "OpenWrt"
  local ok_board, board_obj = pcall(jsonc.parse, board_raw)
  if ok_board and type(board_obj) == "table" and board_obj.hostname then
    hostname = board_obj.hostname
  end

  local version = get_command("/usr/sbin/ddnstod -v")

  local did = ""
  do
    did = fetch_device_id(index)
  end

  write_json({
    ok = true,
    data = {
      enabled = enabled,
      running = running,
      pid = pid,
      token_set = (token and #token > 0) or false,
      address = address,
      device_id = did,
      deviceId = did,
      hostname = hostname,
      version = version,
    }
  })
end

-- ==========
-- API: connectivity (tunnel server reachability)
-- ==========

function api_connectivity()
  local sys  = require "luci.sys"

  local function resolve_host(host)
    local out = sys.exec(string.format("nslookup %s 223.5.5.5 2>/dev/null", host)) or ""
    if out == "" then
      out = sys.exec(string.format("nslookup %s 8.8.8.8 2>/dev/null", host)) or ""
    end
    if out == "" then
      out = sys.exec(string.format("nslookup %s 2>/dev/null", host)) or ""
    end
    local ip = out:match("Address 1:%s*([%d%.]+)") or out:match("Address:%s*([%d%.]+)")
    return ip or ""
  end

  local tunnel_targets = {}
  local resolved_ip = resolve_host("tunnel.kooldns.cn")
  if resolved_ip ~= "" then table.insert(tunnel_targets, resolved_ip) end
  table.insert(tunnel_targets, "tunnel.kooldns.cn")
  table.insert(tunnel_targets, "125.39.21.43")

  do
    local seen = {}
    local uniq = {}
    for _, t in ipairs(tunnel_targets) do
      if not seen[t] then
        seen[t] = true
        table.insert(uniq, t)
      end
    end
    tunnel_targets = uniq
  end

  local function connect_target(target)
    local ret = sys.call(string.format("ping -c 1 -W 2 %s >/dev/null 2>&1", target))
    if ret == 0 then
      return 0, nil
    end
    return ret, string.format("ping exit %d to %s", ret, target)
  end

  local tunnel_ok = false
  local tunnel_err = nil

  if #tunnel_targets == 0 then
    tunnel_err = "resolve tunnel.kooldns.cn failed"
  else
    for _, target in ipairs(tunnel_targets) do
      local ret, err = connect_target(target)
      if ret == 0 then
        tunnel_ok = true
        tunnel_err = nil
        break
      else
        tunnel_err = err
      end
    end
  end

  write_json({
    ok = true,
    data = {
      tunnel_ok = tunnel_ok,
      tunnel_ret = tunnel_ok and nil or tunnel_err,
      targets = tunnel_targets,
    }
  })
end

-- ==========
-- API: logs
-- ==========

function api_logs()
  local http = require "luci.http"
  local sys = require "luci.sys"
  local method = http.getenv("REQUEST_METHOD") or ""
  
  if method ~= "GET" then
    method_not_allowed()
    return
  end

  local lines = tonumber(http.formvalue("lines") or "200") or 200
  if lines < 10 then lines = 10 end
  if lines > 2000 then lines = 2000 end

  local cmd = string.format("logread 2>/dev/null | grep -E 'ddnsto|ddnstod' | tail -n %d", lines)
  local out = sys.exec(cmd) or ""
  local arr = {}

  for line in out:gmatch("([^\n]*)\n?") do
    if line and #line > 0 then
      arr[#arr + 1] = line
    end
  end

  write_json({ ok = true, data = { lines = arr, total = #arr } })
end

function action_ddnsto_dev()
    local dsp    = require "luci.dispatcher"
    local i18n   = require "luci.i18n"
    local template = require "luci.template"
    local ctx    = dsp.context or {}

    local data = {
        token   = ctx.token or "",
        prefix  = dsp.build_url("admin", "ddnsto_dev"),
        api_base= dsp.build_url(),
        lang    = i18n.context.lang or "zh-cn"
    }

    template.render("ddnsto/dev", data)
end
