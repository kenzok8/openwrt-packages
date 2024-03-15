--[[
LuCI - Lua Configuration Interface
 Copyright (C) 2022  sirpdboy <herboy2008@gmail.com> https://github.com/sirpdboy/partexp
]]--

local fs   = require "nixio.fs"
local util = require "nixio.util"
local tp   = require "luci.template.parser"
local uci=luci.model.uci.cursor()
local ver = require "luci.version"

local d.list_disks = function()
  -- get all device names (sdX and mmcblkX)
  local target_devnames = {}
  for dev in fs.dir("/dev") do
    if dev:match("^sd[a-z]$")
      or dev:match("^mmcblk%d+$")
      or dev:match("^sata[a-z]$")
      or dev:match("^nvme%d+n%d+$")
      then
      table.insert(target_devnames, dev)
    end
  end
  local devices = {}
  for i, bname in pairs(target_devnames) do
    local device_info = {}
    local device = "/dev/" .. bname
    device_info["name"] = bname
    device_info["dev"] = device

    s = tonumber((fs.readfile("/sys/class/block/%s/size" % bname)))
    device_info["size"] = s and math.floor(s / 2048)

    devices[#devices+1] = device_info
  end
    return devices
end


return d
